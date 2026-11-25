import type { Widget } from '@lumino/widgets'

/**
 * A node of the persisted dock layout.
 *
 * @remarks
 * - lumino's own `saveLayout()` is **not** serializable: a tab area carries `widgets: Widget[]`, so the
 * config is circular and `JSON.stringify` blows up on it. This tree is the serializable form: the
 * leaves are widget kinds, and a kind exists at most once on the dock, so a leaf is unambiguous
 * - the tree is what the `persistedRef` stores (a state of the `layoutHistories` key), what `restoreLayout` is built
 * from, and what the default layout is written as
 * - a layout may also be **empty** (`{ type: 'empty' }`, the `Blank` preset): then it has no leaf at all, and it is
 * the root of the tree, never a child of a split
 *
 * @example
 * ```ts
 * // the 3D view on the left, the statistics above the help on the right
 * const node: LayoutNode = {
 *   type: 'split',
 *   orientation: 'horizontal',
 *   sizes: [0.5, 0.5],
 *   children: [
 *     { type: 'widget', kind: '3d-view' },
 *     {
 *       type: 'split',
 *       orientation: 'vertical',
 *       sizes: [0.5, 0.5],
 *       children: [
 *         { type: 'widget', kind: 'map-statistics' },
 *         { type: 'widget', kind: 'keyboard-shortcuts' },
 *       ],
 *     },
 *   ],
 * }
 * ```
 */
export type LayoutNode = LayoutNodeEmpty | LayoutNodeSplit | LayoutNodeWidget

/**
 * A layout without a single widget.
 *
 * @remarks
 * The `Blank` preset starts here (2026-11-06, the owner's request; `Custom` before the owner renamed it): the dock is
 * empty, and every widget of the screen is dragged in from the picker. It is a node of its own and not `undefined`, so a state of a history is always a
 * layout, and the parser, the equality and the storage keep one shape.
 *
 * The node is only ever the **root** of a layout: a split drops it the way it drops an unknown kind, so no walk of the
 * tree has to deal with an empty child.
 */
export type LayoutNodeEmpty = {
  /**
   * The discriminated type of the node.
   */
  readonly type: 'empty'
}

/**
 * The layout of an empty dock.
 *
 * @remarks
 * It is a constant, so two empty layouts are the same object: the shell compares the tree of the dock with the tree of
 * the pass ({@link layoutEquals}), and an empty dock has no widget to tell one empty tree from another.
 */
export const emptyLayout: LayoutNodeEmpty = { type: 'empty' }

/**
 * The size of one child of a split.
 *
 * @remarks
 * An `auto` child is flexible: its `ratio` is its share of the space the flexible children get, so it follows the
 * window (the `flex: 1` of a flexbox) — that is the size of a widget nobody locked. A `fixed` widget is **locked** to
 * a pixel size: it keeps that size while the column has room for it, and it shrinks when it has not (the alternative
 * would be a window that scrolls, which the owner did not want).
 *
 * The size **is** the lock: a widget with an `auto` size is not locked, and no other field says it is.
 */
export type ChildSize =
  { readonly kind: 'auto'; readonly ratio: number } | { readonly kind: 'fixed'; readonly px: number }

/**
 * Builds the sizes of a split from plain shares, so a flexible split stays short to write.
 *
 * @param ratios The share of every child, in their order.
 *
 * @returns A size per share, all of them flexible (nothing is locked).
 */
export function flexSizes(...ratios: number[]): ChildSize[] {
  return ratios.map((ratio) => {
    return { kind: 'auto', ratio }
  })
}

/**
 * A split area: its children follow each other along the orientation, and `sizes` gives their shares.
 */
export type LayoutNodeSplit = {
  /**
   * The discriminated type of the node.
   */
  readonly type: 'split'
  /**
   * The axis of the split: `horizontal` puts the children side by side.
   */
  readonly orientation: 'horizontal' | 'vertical'
  /**
   * The size of every child, in the order of `children`.
   */
  readonly sizes: readonly ChildSize[]
  /**
   * The children of the split, at least two of them.
   */
  readonly children: readonly LayoutNode[]
}

/**
 * A widget: its kind is the leaf of the tree.
 */
export type LayoutNodeWidget = {
  /**
   * The discriminated type of the node.
   */
  readonly type: 'widget'
  /**
   * The identifier of the widget kind.
   */
  readonly kind: string
  /**
   * The sides the widget was locked to, when it was locked.
   *
   * @remarks
   * The sizes of the split a widget is in can carry only **one** side of its lock: the width comes from the horizontal
   * split above it and the height from the vertical one. A widget that ends up as a direct child of a horizontal split
   * (the column around it collapsed, or a level of the tree went away) has no vertical ancestor to remember its height,
   * so the lock would be lost on the next load — and a lost lock turns the `fixed` pixels of the split into an `auto`
   * share, which is a very different number (400 shares against the 1 of a flexible neighbor fills the screen). The
   * sides live here, on the widget, so they survive whatever the tree looks like. A widget with a split on one axis only
   * keeps that side alone (2026-11-25, the owner).
   */
  readonly lock?: LockBox
}

/**
 * The sides a widget is locked to.
 *
 * @remarks
 * A side is kept only when the layout can keep it: the **width** is the size the horizontal split above the widget
 * distributes, the **height** the one of the vertical split. A widget with neighbors on one axis only (the key help of
 * the viewer, beside the view) has a width but no height to keep, so its lock is a single side and the other one follows
 * the dock (2026-11-25, the owner: the help stays 350 wide, its height is auto). A widget with a split on both axes
 * keeps both sides.
 */
export type LockBox = {
  /**
   * The width the widget keeps, when the layout has a horizontal split around it.
   */
  readonly width?: number
  /**
   * The height the widget keeps, when the layout has a vertical split around it.
   */
  readonly height?: number
}

/**
 * The axes the layout lets a widget be locked on.
 *
 * @remarks
 * The split around a widget decides one of its sides: a horizontal one cuts the width between its children, a vertical
 * one the height. The width of a widget is therefore kept when a horizontal split is above it, and the height when a
 * vertical one is; the side with no split behind it has nothing to keep it (it is the side of the dock itself), so
 * locking it would freeze the dock, not the widget.
 */
export type LockAxes = {
  /**
   * Whether the layout has a horizontal split around the widget.
   */
  readonly width: boolean
  /**
   * Whether the layout has a vertical split around the widget.
   */
  readonly height: boolean
}

/**
 * Tells whether a number can be a side of a lock.
 *
 * @param px The number to check.
 *
 * @returns True when it is a whole positive number of pixels.
 */
function isLockSize(px: number): boolean {
  return Number.isSafeInteger(px) && px > 0
}

/**
 * Reads the lock a node carries, the way {@link lockedBoxOf} reads it from its widget.
 *
 * @remarks
 * The plate of the lock covers the widget, and it shows the sides the node keeps; reading them from the node is what
 * lets the badge follow a lock that gains a side, without the plate being drawn again.
 *
 * @param node The node of a widget.
 *
 * @returns The sides it keeps, or `undefined` when it is free.
 */
export function lockedSidesOfNode(node: HTMLElement): LockBox | undefined {
  const width = Number(node.dataset.lockedWidth)
  const height = Number(node.dataset.lockedHeight)
  const hasWidth = isLockSize(width)
  const hasHeight = isLockSize(height)

  if (hasWidth && hasHeight) {
    return { width, height }
  }

  if (hasWidth) {
    return { width }
  }

  if (hasHeight) {
    return { height }
  }

  return undefined
}

/**
 * Cuts the sides of a lock to the axes of the layout.
 *
 * @remarks
 * A widget with a split on **both** axes keeps its box, and it needs both sides to keep it (the way it always did): a
 * column of a preset fixes the width of every widget in it, and a side alone would turn the free widget of a nested split
 * into a pinned one. A widget with a **single** axis keeps that side alone, and the other one follows the dock (2026-11-25,
 * the owner: the key help of the viewer stays 350 wide, its height is auto).
 *
 * @param axes The axes the layout lets the widget keep.
 * @param width The width the lock would keep, when it has one.
 * @param height The height the lock would keep, when it has one.
 *
 * @returns The sides the widget may keep, or `undefined` when it has nothing to keep.
 */
export function keptLockOf(axes: LockAxes, width: number | undefined, height: number | undefined): LockBox | undefined {
  if (axes.width && axes.height) {
    if (width === undefined || height === undefined) {
      return undefined
    }

    return { width, height }
  }

  if (axes.width) {
    if (width === undefined) {
      return undefined
    }

    return { width }
  }

  if (height === undefined) {
    return undefined
  }

  return { height }
}

/**
 * Reads the axes a widget is locked on, from the tree of the layout.
 *
 * @remarks
 * The splits over the widget decide its sides: a horizontal one keeps the width of its children, a vertical one the
 * height. The tree is the one of the dock (`toLayoutNode`), not the parent chain of the live widgets: a lumino dock keeps
 * every leaf under the dock itself, and the splits live in the layout config only (2026-11-25).
 *
 * A widget with no split around it at all (alone on the dock) keeps its box, the way it always did: there is no neighbor
 * to take the rest of the space from it, and the box is the size the user asked for.
 *
 * @param node The tree to walk.
 * @param kind The kind of the widget to read.
 *
 * @returns The axes its lock may use.
 */
export function lockAxesOfKind(node: LayoutNode, kind: string): LockAxes {
  let horizontal = false
  let vertical = false

  /**
   * Walks the tree and stops on the widget, carrying the axes of the splits it went through.
   *
   * @param current The node to walk.
   * @param width Whether a horizontal split was met on the way.
   * @param height Whether a vertical split was met on the way.
   *
   * @returns True when the widget of the kind is under the node.
   */
  function walk(current: LayoutNode, width: boolean, height: boolean): boolean {
    if (current.type === 'empty') {
      return false
    }

    if (current.type === 'widget') {
      if (current.kind !== kind) {
        return false
      }

      horizontal = width
      vertical = height

      return true
    }

    for (const child of current.children) {
      if (walk(child, width || current.orientation === 'horizontal', height || current.orientation === 'vertical')) {
        return true
      }
    }

    return false
  }

  const found = walk(node, false, false)

  if (!found || (!horizontal && !vertical)) {
    return { width: true, height: true }
  }

  return { width: horizontal, height: vertical }
}

/**
 * Reads the size a widget is locked to.
 *
 * @param widget The widget to read.
 *
 * @returns The sides it keeps, or `undefined` when it is free to follow the layout.
 */
export function lockedBoxOf(widget: Widget): LockBox | undefined {
  return lockedSidesOfNode(widget.node)
}

/**
 * Locks a widget to a size, or unlocks it.
 *
 * @remarks
 * The lock is written on the node only: the sizes of the dock are worked out from the tree (`contentFit.ts` gives
 * every child of a split its size, and the lock is a `fixed` size there), so a css limit would be a second, partial
 * mechanism that leaves a hole in the column.
 *
 * @param widget The widget to change.
 * @param box The size to lock it to, or `undefined` to free it.
 */
export function lockWidgetTo(widget: Widget, box: LockBox | undefined): void {
  if (box === undefined) {
    delete widget.node.dataset.lockedWidth
    delete widget.node.dataset.lockedHeight

    return
  }

  if (box.width === undefined) {
    delete widget.node.dataset.lockedWidth
  } else {
    widget.node.dataset.lockedWidth = box.width.toString()
  }

  if (box.height === undefined) {
    delete widget.node.dataset.lockedHeight
  } else {
    widget.node.dataset.lockedHeight = box.height.toString()
  }
}

/**
 * The shares are floating point numbers, so the comparison of two layouts allows this much difference.
 *
 * Without it a layout that came back from the storage would count as modified right away.
 */
const SIZE_EPSILON = 0.005

/**
 * Collects the widget kinds of a tree, in the order of the layout.
 *
 * @param node The tree to walk.
 *
 * @returns The kinds, without duplicates.
 */
export function collectKinds(node: LayoutNode): string[] {
  if (node.type === 'widget') {
    return [node.kind]
  }

  if (node.type === 'empty') {
    return []
  }

  const kinds = node.children.flatMap((child) => {
    return collectKinds(child)
  })

  return [...new Set(kinds)]
}

/**
 * Tells whether two child sizes are the same.
 *
 * @param first The size the editor has now.
 * @param second The size it is compared against.
 *
 * @returns True when both are the same kind, with the same ratio (up to the rounding) or the same pixel size.
 */
function sizeEquals(first: ChildSize, second: ChildSize | undefined): boolean {
  if (second?.kind !== first.kind) {
    return false
  }

  if (first.kind === 'fixed' && second.kind === 'fixed') {
    return first.px === second.px
  }

  // both are auto here
  let ratio = 0
  let other = 0

  if (first.kind === 'auto') {
    ratio = first.ratio
  }

  if (second.kind === 'auto') {
    other = second.ratio
  }

  return Math.abs(ratio - other) <= SIZE_EPSILON
}

/**
 * Tells whether two layouts are the same tree with the same sizes.
 *
 * @remarks
 * This is what the reset button asks: it is shown only when the current layout differs from the
 * default one.
 *
 * @param first The layout the editor has now.
 * @param second The one to compare against (the default layout).
 *
 * @returns `true` when the trees have the same shape, the same kinds and close enough sizes.
 */
export function layoutEquals(first: LayoutNode, second: LayoutNode): boolean {
  // the empty layout has nothing to compare: two empty layouts are the same, an empty one and a tree never are
  if (first.type === 'empty' || second.type === 'empty') {
    return first.type === 'empty' && second.type === 'empty'
  }

  if (first.type === 'widget' || second.type === 'widget') {
    return first.type === 'widget' && second.type === 'widget' && first.kind === second.kind
  }

  if (first.orientation !== second.orientation || first.children.length !== second.children.length) {
    return false
  }

  const sameSizes = first.sizes.every((size, index) => {
    return sizeEquals(size, second.sizes[index])
  })

  if (!sameSizes) {
    return false
  }

  return first.children.every((child, index) => {
    return layoutEquals(child, second.children[index])
  })
}

/**
 * Tells whether two layouts are the same tree, whatever the sizes are.
 *
 * @remarks
 * A preset switch works from the shape: the widgets and the splits decide what the dock is, and the sizes are the
 * business of the pass (a preset and the dock it was applied to can differ in a few pixels and still be the same
 * layout). This is what the preset of the shell asks before it applies itself again: the same shape means the layout
 * is already that preset's (TODO 281).
 *
 * @param first One layout.
 * @param second The other one.
 *
 * @returns `true` when the trees have the same splits and the same kinds in the same places.
 */
export function layoutShapeEquals(first: LayoutNode, second: LayoutNode): boolean {
  // the empty layout has nothing to compare: two empty layouts are the same, an empty one and a tree never are
  if (first.type === 'empty' || second.type === 'empty') {
    return first.type === 'empty' && second.type === 'empty'
  }

  if (first.type === 'widget' || second.type === 'widget') {
    return first.type === 'widget' && second.type === 'widget' && first.kind === second.kind
  }

  if (first.orientation !== second.orientation || first.children.length !== second.children.length) {
    return false
  }

  return first.children.every((child, index) => {
    return layoutShapeEquals(child, second.children[index])
  })
}

/**
 * Normalizes the sizes of a split to the children it really has.
 *
 * @remarks
 * A child is dropped when its kind is unknown, and then its size has to go: the remaining shares are
 * renormalized to one, otherwise lumino would leave a gap where the dropped child was.
 *
 * @param sizes The sizes of the original children.
 * @param kept The indexes of the children that are kept.
 *
 * @returns The sizes of the kept children: the **flexible** ratios normalized to one, the locks untouched.
 */
export function pickSizes(sizes: readonly ChildSize[], kept: readonly number[]): ChildSize[] {
  const picked = kept.map((index) => {
    return sizes[index] ?? { kind: 'auto' as const, ratio: 0 }
  })
  let total = 0

  for (const size of picked) {
    if (size.kind === 'auto') {
      total = total + size.ratio
    }
  }

  const flexible = picked.filter((size) => {
    return size.kind === 'auto'
  })
  const numberOfFlexible = flexible.length

  return picked.map((size): ChildSize => {
    if (size.kind === 'fixed') {
      return size
    }

    if (numberOfFlexible === 0 || total <= 0) {
      return { kind: 'auto', ratio: 1 / picked.length }
    }

    // the ratios are the shares of the space the locks leave: a locked child takes its pixels out of the space first,
    // so it must not count in the sum the flexible ones are normalized against, or every pass would add a little to
    // the flexible children and the layout would grow on its own
    return { kind: 'auto', ratio: size.ratio / total }
  })
}

/**
 * Reads one size of a split from an unknown value.
 *
 * @remarks
 * The old shape of the storage was a bare number: a layout saved with it is **not** migrated (the editor is not
 * 1.0.0 yet), so a bare number makes the whole layout unknown, and the default takes over.
 *
 * @param value The value to read.
 *
 * @returns The size, or `null` when the value is not one.
 */
function isChildSize(value: unknown): value is ChildSize {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Record<string, unknown>

  if (candidate.kind === 'fixed') {
    return typeof candidate.px === 'number' && Number.isSafeInteger(candidate.px) && candidate.px > 0
  }

  if (candidate.kind === 'auto') {
    return typeof candidate.ratio === 'number' && Number.isFinite(candidate.ratio) && candidate.ratio > 0
  }

  return false
}

/**
 * Reads the leaf of a widget from an unknown value.
 *
 * @param candidate The value, as a record.
 *
 * @returns The leaf, or `null` when the value is not a widget.
 */
function parseWidgetNode(candidate: Record<string, unknown>): LayoutNodeWidget | null {
  if (typeof candidate.kind !== 'string' || candidate.kind.length === 0) {
    return null
  }

  const box = candidate.lock

  if (box === undefined) {
    return { type: 'widget', kind: candidate.kind }
  }

  if (typeof box !== 'object' || box === null) {
    return null
  }

  const { width, height } = box as Record<string, unknown>

  // a lock keeps one side or both, the way the layout wrote it (2026-11-25, the owner: the key help keeps its width); a
  // side that is there and is not a size makes the whole lock unknown
  if (typeof width === 'number' && isLockSize(width)) {
    if (height === undefined) {
      return { type: 'widget', kind: candidate.kind, lock: { width } }
    }

    if (typeof height === 'number' && isLockSize(height)) {
      return { type: 'widget', kind: candidate.kind, lock: { width, height } }
    }

    return null
  }

  if (width !== undefined) {
    return null
  }

  if (typeof height === 'number' && isLockSize(height)) {
    return { type: 'widget', kind: candidate.kind, lock: { height } }
  }

  return null
}

/**
 * Reads a layout tree from an unknown value (the parsed content of the storage).
 *
 * @remarks
 * The shape is validated, not the kinds: whether a kind is known is a question for
 * {@link toDockConfig}, which has the live widgets. Everything that is not a valid layout gives
 * `null`, and the caller falls back to the default. The empty layout is read back as
 * {@link emptyLayout}, and it is dropped from the children of a split, where it would be a shape this build does not
 * write.
 *
 * @param value The value to read.
 *
 * @returns The tree, or `null` when the value is not a layout.
 */
export function parseLayoutNode(value: unknown): LayoutNode | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (candidate.type === 'empty') {
    return emptyLayout
  }

  if (candidate.type === 'widget') {
    return parseWidgetNode(candidate)
  }

  if (candidate.type !== 'split') {
    return null
  }

  const { orientation } = candidate

  if (orientation !== 'horizontal' && orientation !== 'vertical') {
    return null
  }

  if (!Array.isArray(candidate.sizes) || !Array.isArray(candidate.children)) {
    return null
  }

  const children = candidate.children
    .map((child) => {
      return parseLayoutNode(child)
    })
    .filter((child): child is LayoutNode => {
      // an empty child is dropped like an unknown kind: the empty layout is only ever the root
      return child !== null && child.type !== 'empty'
    })

  if (children.length < 2) {
    if (children.length === 1) {
      return children[0]
    }

    return null
  }

  const sizes = candidate.sizes.filter((size): size is ChildSize => {
    return isChildSize(size)
  })

  return {
    type: 'split',
    orientation,
    sizes: pickSizes(
      sizes,
      children.map((_, index) => {
        return index
      }),
    ),
    children,
  }
}
