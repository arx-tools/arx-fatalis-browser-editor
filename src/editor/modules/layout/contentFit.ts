import type { ChildSize, LayoutNode } from './layoutNode.ts'

/**
 * The smallest height a widget may shrink to, even when there is no room for the height its content wants.
 *
 * @remarks
 * It is not zero: a widget squeezed to nothing could not be dragged back (the splitter needs a line to grab) and the
 * dock would look broken. 40 is the height of the header of a widget plus a line, the same floor the css gives.
 */
export const MIN_WIDGET_HEIGHT = 40

/**
 * The smallest width a widget may shrink to, the same floor the css gives.
 */
export const MIN_WIDGET_WIDTH = 80

/**
 * The box a node of the layout occupies.
 */
export interface LayoutSpace {
  /**
   * The width of the box.
   */
  readonly width: number
  /**
   * The height of the box.
   */
  readonly height: number
}

/**
 * The limits of a node along one axis.
 *
 * @remarks
 * There are two minimums on purpose. The **content** one is the height the rows of a list need: it is a wish, not a
 * rule, because a list can scroll. The **floor** one is the smallest size the node may ever take (the splitter has to
 * be grabbable). When the locks and the contents do not fit in the space together, the contents are relaxed to the
 * floors first — a lock is the will of the user, a row of text can scroll — and only after that does everything
 * shrink.
 */
export interface AxisFit {
  /**
   * The size the content wants.
   */
  readonly min: number
  /**
   * The smallest size the node may ever take.
   */
  readonly floor: number
  /**
   * The biggest size it may take, or `Infinity` when nothing locks it.
   */
  readonly max: number
}

/**
 * The limits of one widget, per axis.
 */
export interface WidgetFit {
  /**
   * The limits along the width.
   */
  readonly width: AxisFit
  /**
   * The limits along the height.
   */
  readonly height: AxisFit
}

/**
 * The room one child of a split asks for, along the axis of the split.
 *
 * @remarks
 * The numbers are the `flex-basis`, the minimums and the maximum of a flexbox item, with one difference: the **max is
 * the lock of the user**, not a css rule. The allocator respects it, so the space a lock does not use goes to the
 * other children — a css `max` on the node itself can not do that, because lumino keeps the slot at the size the
 * shares gave it and the leftover shows as a hole.
 */
export interface ChildFit {
  /**
   * The size the shares want before the limits are applied.
   */
  readonly hint: number
  /**
   * The size the content wants.
   */
  readonly min: number
  /**
   * The smallest size the child may ever take.
   */
  readonly floor: number
  /**
   * The biggest size it may take, or `Infinity` when nothing locks it.
   */
  readonly max: number
}

/**
 * The tolerance of the allocator, in pixels: below this the sum of the sizes counts as the space.
 */
const EPSILON = 0.5

/**
 * The number of passes the allocator may take before it gives up.
 *
 * @remarks
 * Every pass either fills a child up to a limit or hands its share to the others, so a handful of passes is always
 * enough: the loop stops on the first pass that has nothing left to move.
 */
const MAX_PASSES = 8

/**
 * Keeps a number inside a range.
 *
 * @param value The number to keep.
 * @param min The lower end of the range.
 * @param max The upper end of the range.
 *
 * @returns The number, clamped into the range.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Adds up a list of numbers.
 *
 * @param values The numbers to add.
 *
 * @returns Their sum, or zero for an empty list.
 */
function sum(values: readonly number[]): number {
  let total = 0

  for (const value of values) {
    total = total + value
  }

  return total
}

/**
 * Takes a size away from the children a filter picks, in proportion to the room they have.
 *
 * @param sizes The sizes to change, in place.
 * @param children The room each child asks for.
 * @param amount How much to take away.
 * @param picked Decides which children may give.
 *
 * @returns How much was taken.
 */
function shrinkFrom(
  sizes: number[],
  children: readonly ChildFit[],
  amount: number,
  picked: (child: ChildFit) => boolean,
): number {
  const slack = sizes.map((size, index) => {
    const child = children[index]

    if (child === undefined || !picked(child)) {
      return 0
    }

    return Math.max(0, size - child.min)
  })
  const total = sum(slack)

  if (total <= EPSILON) {
    return 0
  }

  const taken = Math.min(amount, total)
  const scale = taken / total

  for (const [index, room] of slack.entries()) {
    const size = sizes[index] ?? 0

    const give = room * scale

    sizes[index] = size - give
  }

  return taken
}

/**
 * Takes a size away from the children that are above their minimum, in proportion to the room they have.
 *
 * @param sizes The sizes to change, in place.
 * @param children The room each child asks for.
 * @param amount How much to take away.
 *
 * @returns Whether anything was taken, so another pass may fill the space exactly.
 */
function shrink(sizes: number[], children: readonly ChildFit[], amount: number): boolean {
  // the free children give first: a lock is the will of the user, and it only shrinks when nothing else can
  const free = shrinkFrom(sizes, children, amount, (child) => {
    return child.max === Number.POSITIVE_INFINITY
  })

  if (free >= amount - EPSILON) {
    return true
  }

  const rest = shrinkFrom(sizes, children, amount - free, () => {
    return true
  })

  return rest > 0 || free > 0
}

/**
 * Gives a size to the children that are below their maximum, in equal parts.
 *
 * @param sizes The sizes to change, in place.
 * @param children The room each child asks for.
 * @param amount How much to give.
 *
 * @returns Whether anything was given, so another pass may fill the space exactly.
 */
function grow(sizes: number[], children: readonly ChildFit[], amount: number): boolean {
  const open = sizes.map((size, index) => {
    const max = children[index]?.max ?? Number.POSITIVE_INFINITY

    return max - size > EPSILON
  })
  let remaining = amount

  for (let pass = 0; pass < MAX_PASSES && remaining > EPSILON; pass = pass + 1) {
    let count = 0

    for (const isOpen of open) {
      if (isOpen) {
        count = count + 1
      }
    }

    if (count === 0) {
      return false
    }

    const share = remaining / count
    let used = 0

    for (const [index, isOpen] of open.entries()) {
      if (!isOpen) {
        continue
      }

      const size = sizes[index] ?? 0
      const max = children[index]?.max ?? Number.POSITIVE_INFINITY
      const room = max - size

      if (share >= room - EPSILON) {
        sizes[index] = size + Math.max(0, room)
        used = used + Math.max(0, room)
        open[index] = false
      } else {
        sizes[index] = size + share
        used = used + share
      }
    }

    remaining = remaining - used
  }

  return true
}

/**
 * Tells whether the contents have to be relaxed to their floors.
 *
 * @remarks
 * The contents are relaxed only when they can not fit next to the locks: a lock is the will of the user, and a list
 * that does not get the height of its rows can scroll inside the height it got. When there is room, the content wins.
 * A free child asks for its content, a locked one for its lock: the shares of the ratios play no part here, they only
 * decide how the room that is left is cut up.
 *
 * @param space The size of the split along its axis.
 * @param children The room each child asks for.
 *
 * @returns True when the contents may not have the size they want.
 */
function isContentRelaxed(space: number, children: readonly ChildFit[]): boolean {
  let wanted = 0

  for (const child of children) {
    if (child.max === Number.POSITIVE_INFINITY) {
      wanted = wanted + child.min

      continue
    }

    wanted = wanted + clamp(child.hint, child.min, child.max)
  }

  return wanted > space + EPSILON
}

/**
 * Scales the sizes so that they fill the space exactly.
 *
 * @remarks
 * The loop of the allocator stops when it can not move anything any more, which leaves the sum off the space by the
 * rounding of the divisions, or bigger than it when the floors themselves do not fit: the sizes are scaled to the
 * space, so the dock never overflows and never leaves a hole.
 *
 * @param space The size of the split along its axis.
 * @param sizes The sizes the loop ended with.
 *
 * @returns The sizes, scaled to the space when they are off.
 */
function fitExactly(space: number, sizes: readonly number[]): number[] {
  const total = sum(sizes)

  if (total <= EPSILON || space <= 0) {
    return [...sizes]
  }

  const scale = space / total

  return sizes.map((size) => {
    return size * scale
  })
}

/**
 * Distributes a space among the children of a split.
 *
 * @remarks
 * The sizes start from the hints (the share of a ratio, or the pixels of a lock), are clamped into their limits, and
 * then the difference between their sum and the space is given to the children that still have room: a negative
 * difference is taken from the ones above their minimum, a positive one is put on the ones below their maximum, and
 * the pass is repeated until the sum is the space or no child has room left. That is what makes a lock work: a child
 * locked to 300 keeps 300 and the rest of the space is shared by the others, instead of leaving a hole where the lock
 * could not grow.
 *
 * @param space The size of the split along its axis.
 * @param children The room each child asks for, in their order.
 *
 * @returns The size of every child, in the same order.
 */
export function splitSizes(space: number, children: readonly ChildFit[]): number[] {
  const soft = isContentRelaxed(space, children)

  const limits = children.map((child) => {
    if (!soft) {
      return child
    }

    return { ...child, min: child.floor }
  })
  const sizes = limits.map(({ hint, min, max }) => {
    return clamp(hint, min, max)
  })

  for (let pass = 0; pass < MAX_PASSES; pass = pass + 1) {
    const difference = space - sum(sizes)

    if (Math.abs(difference) <= EPSILON) {
      break
    }

    let moved = false

    if (difference < 0) {
      moved = shrink(sizes, limits, -difference)
    } else {
      moved = grow(sizes, limits, difference)
    }

    if (!moved) {
      break
    }
  }

  return fitExactly(space, sizes)
}

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
  if (current.type === 'widget') {
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
