import type { ChildSize, LayoutNode } from '../layoutNode.ts'
import { splitSizes, sum, type ChildFit, type LayoutSpace, type WidgetFit } from './split.ts'

/**
 * The plan of a layout: the size of every child of every split.
 *
 * @remarks
 * The editor lays the dock out itself, not lumino: lumino keeps a slot at the share the tree gives a child and only
 * clamps the node into it, so a widget pinned with a css limit leaves a hole in its column instead of handing the space
 * to its neighbours. The walk here gives every split its box, asks the allocator ([`split.ts`](split.ts)) for the size
 * of its children, and goes on with the box each child got.
 */

/**
 * Reads the limits of one widget along one axis.
 *
 * @param fit The limits of the widget.
 * @param orientation The axis of the split the widget is in.
 *
 * @returns The limits along that axis, with no hint: a hint belongs to a child of a split, not to a widget.
 */
function axisOf(fit: WidgetFit, orientation: 'horizontal' | 'vertical'): ChildFit {
  if (orientation === 'vertical') {
    return { hint: 0, ...fit.height }
  }

  return { hint: 0, ...fit.width }
}

/**
 * Reads the limits of a node along one axis, adding up the limits of the nodes below it.
 *
 * @remarks
 * A split is as small as it can make itself: along the axis it distributes it needs the sum of what its children
 * need, and it may grow as far as the sum of their maximums; across that axis it needs the biggest of its children and
 * may grow as far as the smallest of them. That is how the lock of a widget reaches the size of its column: the column
 * can not grow past the width the locked widget may take.
 *
 * @param node The node to read.
 * @param orientation The axis to read it for.
 * @param fitOf Reads the limits of a widget.
 *
 * @returns The limits of the node along that axis.
 */
export function fitOfNode(
  node: LayoutNode,
  orientation: 'horizontal' | 'vertical',
  fitOf: (kind: string) => WidgetFit,
): ChildFit {
  if (node.type === 'widget') {
    return axisOf(fitOf(node.kind), orientation)
  }

  // the empty layout has nothing to measure: it is the root of an empty dock, and the walk never asks for its children
  if (node.type === 'empty') {
    return { hint: 0, min: 0, floor: 0, max: 0 }
  }

  const children = node.children.map((child) => {
    return fitOfNode(child, orientation, fitOf)
  })

  const mins = children.map((child) => {
    return child.min
  })
  const floors = children.map((child) => {
    return child.floor
  })
  const maxes = children.map((child) => {
    return child.max
  })

  if (node.orientation === orientation) {
    return { hint: 0, min: sum(mins), floor: sum(floors), max: sum(maxes) }
  }

  return {
    hint: 0,
    min: Math.max(0, ...mins),
    floor: Math.max(0, ...floors),
    max: Math.min(Number.POSITIVE_INFINITY, ...maxes),
  }
}

/**
 * Reads the size a child asks for, before the limits of the widgets are applied.
 *
 * @param size The size of the child in the layout.
 * @param free The space the locks of the split leave for the children that are not locked.
 *
 * @returns The pixels the child wants: its own size when it is locked, its share of the free space when it is not.
 */
function hintOf(size: ChildSize | undefined, free: number): number {
  if (size === undefined) {
    return free
  }

  if (size.kind === 'fixed') {
    return size.px
  }

  return size.ratio * free
}

/**
 * Adds up the space the locked children of a split take, which the others do not share.
 *
 * @param sizes The sizes of the children of the split.
 * @param span The size of the split along its axis.
 *
 * @returns The pixels the locks ask for.
 */
function lockedSpan(sizes: ReadonlyArray<ChildSize | undefined>, span: number): number {
  let total = 0

  for (const size of sizes) {
    if (size?.kind === 'fixed') {
      total = total + Math.min(size.px, span)
    }
  }

  return total
}

/**
 * What the walk of the tree carries from the root down.
 */
interface PlanContext {
  /**
   * The map the sizes are written into.
   */
  readonly sizes: Map<LayoutNode, number>
  /**
   * Reads the limits of a widget.
   */
  readonly fitOf: (kind: string) => WidgetFit
  /**
   * The room one gap between two children takes.
   */
  readonly spacing: number
}

/**
 * Walks one node of the layout with the box it got, writing the size of its children.
 *
 * @param current The node to walk.
 * @param box The space it has.
 * @param context The map of the sizes, the limits of the widgets and the spacing of the splits.
 */
function walk(current: LayoutNode, box: LayoutSpace, context: PlanContext): void {
  // only a split hands out sizes: a widget is a leaf, and the empty layout has no child at all
  if (current.type !== 'split') {
    return
  }

  const horizontal = current.orientation === 'horizontal'
  let span = box.height

  if (horizontal) {
    span = box.width
  }

  // the split spends a spacing on every gap between its children, and that is not theirs to share
  const gaps = Math.max(0, current.children.length - 1)
  const used = context.spacing * gaps

  span = Math.max(0, span - used)

  // the locks take their pixels out of the space first, and the shares of the ratios are the ratios of what is left
  const free = Math.max(0, span - lockedSpan(current.sizes, span))
  const children = current.children.map((child, index) => {
    const fit = fitOfNode(child, current.orientation, context.fitOf)

    return { ...fit, hint: hintOf(current.sizes[index], free) }
  })
  const allocated = splitSizes(span, children)

  for (const [index, child] of current.children.entries()) {
    const size = allocated[index] ?? 0

    context.sizes.set(child, size)

    let next: LayoutSpace = { width: box.width, height: size }

    if (horizontal) {
      next = { width: size, height: box.height }
    }

    walk(child, next, context)
  }
}

/**
 * Works out the size of every child of a split, from the shares of the layout and the limits of the widgets.
 *
 * @remarks
 * It walks the tree: every split is given its box, the sizes of its children are allocated from it, and a child that
 * is a split is walked with the box it got. The shares of the layout are the **hints**: a child with a `fixed` size
 * asks for exactly that many pixels (it is locked), an `auto` one asks for its ratio of the space. A view has no
 * content of its own, so its hint is its share, and the same goes for a list whose rows are shorter than that.
 *
 * @param node The tree to walk.
 * @param space The box of the whole layout.
 * @param fitOf Reads the limits of a widget: its content, its lock and the css floor.
 * @param spacing The room one gap between two children takes, which the split does not share with them.
 *
 * @returns The size of every child of every split, along the axis of the split it is in.
 */
export function planLayout(
  node: LayoutNode,
  space: LayoutSpace,
  fitOf: (kind: string) => WidgetFit,
  spacing = 0,
): Map<LayoutNode, number> {
  const sizes = new Map<LayoutNode, number>()

  walk(node, space, { sizes, fitOf, spacing })

  return sizes
}
