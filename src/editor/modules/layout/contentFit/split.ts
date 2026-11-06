/**
 * The allocator of a split: the numbers a box gives its children.
 *
 * @remarks
 * A split of the dock hands out the space along its axis, and every child has three limits: a **minimum** (the height its
 * content wants, or the floor of the css), a **maximum** (the lock of the widget, when it has one), and a **share** (the
 * ratio the layout asks for). The allocator fits those into the space: it takes the minimums first, grows the children
 * towards their hints, gives the locks their pixels and shares the rest, and when the space is too small it shrinks
 * everything down to the floors instead of cutting a child off.
 *
 * The tree walk that asks for these numbers is [`plan.ts`](plan.ts).
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
export function sum(values: readonly number[]): number {
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
