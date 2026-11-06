import type { DockLayout, Widget } from '@lumino/widgets'
import {
  lockedBoxOf,
  pickSizes,
  type ChildSize,
  type LayoutNode,
  type LayoutNodeSplit,
  type LockBox,
} from './layoutNode.ts'

/**
 * The lumino side of the layout: the dock config, and the lock a child of a split carries.
 *
 * @remarks
 * The editor keeps its layout as a **tree** (`LayoutNode`), because lumino's config carries the widget instances
 * themselves and can not be stored. This module is the bridge: it reads the config of a live dock back into the tree
 * (`toLayoutNode`), builds a config from a tree (`toDockConfig`), and finds the **lock** that decides the size of a
 * child of a split (a lock is the box of a widget, `LockBox` on the model).
 *
 * The tree itself — its types, the equality of two layouts, the parser of the storage — is
 * [`layoutNode.ts`](layoutNode.ts).
 */

/**
 * The weight of a size, as lumino's config wants it.
 *
 * @remarks
 * The config carries the sizes the pass worked out, so a locked child gets its pixel size as the weight and the
 * flexible ones the pixels of their share; only a layout without a plan falls back to the ratios. Lumino reads the
 * weights as shares of the space it has, so the pixels of the plan are what it lays the children out with.
 *
 * @param size The size of the child.
 *
 * @returns The number to put into the config.
 */
function weightOf(size: ChildSize): number {
  if (size.kind === 'fixed') {
    return size.px
  }

  return size.ratio
}

/**
 * Finds the lock that decides the size of a child of a split, along the axis of the split.
 *
 * @remarks
 * A widget carries its own lock, and the two sides of it do not reach the same nodes. The side **across** a split is
 * the size of the split itself: the height of the jump row is the height of the jump widget, so a locked jump fixes the
 * row. The side **along** a split is only shared by the children of the split: a widget's own width is its width in
 * its split, and it says nothing about the width of the column around it.
 *
 * That is why the walk stops at a split of the same orientation: the children of a horizontal split cut up the width
 * between themselves, so a widget inside one of them does not speak for the width of the parent. The walk goes over
 * the **areas** of the dock, not over the tree, because the areas are what hold the live widgets.
 *
 * @param area The area of the dock the child came from.
 * @param orientation The axis of the split the child is in.
 *
 * @returns The lock box, or `undefined` when nothing in the child is locked.
 */
function lockOfChild(
  area: DockLayout.AreaConfig | undefined,
  orientation: 'horizontal' | 'vertical',
): LockBox | undefined {
  if (area === undefined) {
    return undefined
  }

  if (area.type === 'tab-area') {
    const widget = area.widgets[0]

    if (widget === undefined) {
      return undefined
    }

    return lockedBoxOf(widget)
  }

  // the children of this split share the width (or the height) of it, they do not take it from each other
  if (area.orientation === orientation) {
    return undefined
  }

  for (const child of area.children) {
    const box = lockOfChild(child, orientation)

    if (box !== undefined) {
      return box
    }
  }

  return undefined
}

/**
 * Reads the size of one child of a split.
 *
 * @remarks
 * A lock is not a thing lumino knows about: it lives on the node of the widget ({@link lockedBoxOf}), so the size of
 * a widget is read from there and the ratio from the dock. A child that is itself a split is always flexible.
 *
 * @param ratio The share the dock gave it.
 * @param area The dock area the child came from, which is where a lock lives.
 * @param orientation The axis of the split the child is in: a lock keeps both sides, this picks the one that matters.
 *
 * @returns The size spec of that child.
 */
function sizeOfChild(
  ratio: number,
  area: DockLayout.AreaConfig | undefined,
  orientation: 'horizontal' | 'vertical',
): ChildSize {
  const box = lockOfChild(area, orientation)

  if (box === undefined) {
    return { kind: 'auto', ratio }
  }

  if (orientation === 'vertical') {
    return { kind: 'fixed', px: box.height }
  }

  return { kind: 'fixed', px: box.width }
}

/**
 * Converts a lumino layout config into the persisted tree.
 *
 * @remarks
 * A tab area keeps only its first widget: a kind exists at most once on the dock, so a tab area with
 * two widgets is not something the editor produces. A split with a single surviving child collapses
 * into that child.
 *
 * @param config The config of a `DockLayout.saveLayout()` call.
 * @param kindOf Reads the kind of a widget.
 *
 * @returns The tree, or `null` when there is nothing usable in the config.
 */
export function toLayoutNode(
  config: DockLayout.ILayoutConfig,
  kindOf: (widget: Widget) => string | undefined,
): LayoutNode | null {
  const { main } = config

  if (main === null) {
    return null
  }

  if (main.type === 'tab-area') {
    const widget = main.widgets[0]

    if (widget === undefined) {
      return null
    }

    const kind = kindOf(widget)

    if (kind === undefined) {
      return null
    }

    const box = lockedBoxOf(widget)

    if (box === undefined) {
      return { type: 'widget', kind }
    }

    return { type: 'widget', kind, lock: box }
  }

  const children: LayoutNode[] = []
  const kept: number[] = []

  for (const [index, child] of main.children.entries()) {
    const node = toLayoutNode({ main: child }, kindOf)

    if (node !== null) {
      children.push(node)
      kept.push(index)
    }
  }

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return children[0]
  }

  const raw = children.map((_, position) => {
    return sizeOfChild(main.sizes[kept[position] ?? 0] ?? 0, main.children[kept[position] ?? 0], main.orientation)
  })

  // a widget that got locked between two passes turns its share into pixels: the shares of the others grow to the whole
  // space the locks leave, or the layout would add the difference to them on every pass
  const sizes = pickSizes(
    raw,
    children.map((_, index) => {
      return index
    }),
  )

  return { type: 'split', orientation: main.orientation, sizes, children }
}

/**
 * Works out the weight of every kept child of a split.
 *
 * @param node The split to read.
 * @param kept The indexes of the children that survived.
 * @param sizes The planned pixels, when the caller has a plan.
 *
 * @returns One weight per kept child, in their order.
 */
function weightsOf(
  node: LayoutNodeSplit,
  kept: readonly number[],
  sizes: ReadonlyMap<LayoutNode, number> | undefined,
): number[] {
  const picked = pickSizes(node.sizes, kept)
  const weights: number[] = []

  for (const [position, index] of kept.entries()) {
    const child = node.children[index]

    if (sizes !== undefined && child !== undefined) {
      weights.push(sizes.get(child) ?? 0)

      continue
    }

    weights.push(weightOf(picked[position] ?? { kind: 'auto', ratio: 1 }))
  }

  return weights
}

/**
 * Builds a lumino layout config from the persisted tree.
 *
 * @remarks
 * A widget whose kind has no live instance is dropped, and so is the split that loses a child: the
 * caller gets `null` when nothing is left, and falls back to the default layout, so the screen is never
 * empty.
 *
 * @param node The node to build from.
 * @param widgetOf Finds the live widget of a kind.
 * @param sizes The planned pixel size of every child of a split, when the caller has a plan.
 *
 * @returns The config for `restoreLayout`, or `null` when the tree can not be built.
 */
export function toDockConfig(
  node: LayoutNode,
  widgetOf: (kind: string) => Widget | undefined,
  sizes?: ReadonlyMap<LayoutNode, number>,
): DockLayout.ILayoutConfig | null {
  if (node.type === 'widget') {
    const widget = widgetOf(node.kind)

    if (widget === undefined) {
      return null
    }

    return { main: { type: 'tab-area', widgets: [widget], currentIndex: 0 } }
  }

  const children: DockLayout.AreaConfig[] = []
  const kept: number[] = []

  for (const [index, child] of node.children.entries()) {
    const area = toDockConfig(child, widgetOf, sizes)?.main

    if (area === null || area === undefined) {
      continue
    }

    children.push(area)
    kept.push(index)
  }

  if (children.length === 0) {
    return null
  }

  if (children.length === 1) {
    return { main: children[0] }
  }

  return {
    main: {
      type: 'split-area',
      orientation: node.orientation,
      sizes: weightsOf(node, kept, sizes),
      children,
    },
  }
}
