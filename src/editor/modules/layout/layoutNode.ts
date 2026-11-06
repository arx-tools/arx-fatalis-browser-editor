import type { DockLayout, Widget } from '@lumino/widgets'

/**
 * A node of the persisted dock layout.
 *
 * @remarks
 * - lumino's own `saveLayout()` is **not** serializable: a tab area carries `widgets: Widget[]`, so the
 * config is circular and `JSON.stringify` blows up on it. This tree is the serializable form: the
 * leaves are widget kinds, and a kind exists at most once on the dock, so a leaf is unambiguous
 * - the tree is what the `persistedRef` stores (`key: 'layout'`), what `restoreLayout` is built from,
 * and what the default layout is written as
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
export type LayoutNode = LayoutNodeSplit | LayoutNodeWidget

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
export interface LayoutNodeSplit {
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
export interface LayoutNodeWidget {
  /**
   * The discriminated type of the node.
   */
  readonly type: 'widget'
  /**
   * The identifier of the widget kind.
   */
  readonly kind: string
  /**
   * The box the widget was locked to, when it was locked.
   *
   * @remarks
   * The sizes of the split a widget is in can carry only **one** side of its lock: the width comes from the horizontal
   * split above it and the height from the vertical one. A widget that ends up as a direct child of a horizontal split
   * (the column around it collapsed, or a level of the tree went away) has no vertical ancestor to remember its height,
   * so the lock would be lost on the next load — and a lost lock turns the `fixed` pixels of the split into an `auto`
   * share, which is a very different number (400 shares against the 1 of a flexible neighbour fills the screen). The
   * box lives here, on the widget, so both sides survive whatever the tree looks like.
   */
  readonly lock?: LockBox
}

/**
 * The size a widget is locked to, if it is locked at all.
 *
 * @remarks
 * The lock is the **box** of the widget: a locked widget keeps both its width and its height, so a column of the dock
 * can not grow wider around it either. It lives on the node of the widget (as two attributes), and the saved layout
 * reads it back from there: the size of a widget is a `fixed` size in the tree, so nothing else has to remember that
 * it was locked.
 */
export interface LockBox {
  /**
   * The width the widget keeps.
   */
  readonly width: number
  /**
   * The height the widget keeps.
   */
  readonly height: number
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
 * Reads the size a widget is locked to.
 *
 * @param widget The widget to read.
 *
 * @returns The box it keeps, or `undefined` when it is free to follow the layout.
 */
export function lockedBoxOf(widget: Widget): LockBox | undefined {
  const width = Number(widget.node.dataset.lockedWidth)
  const height = Number(widget.node.dataset.lockedHeight)

  if (!isLockSize(width) || !isLockSize(height)) {
    return undefined
  }

  return { width, height }
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

  widget.node.dataset.lockedWidth = box.width.toString()
  widget.node.dataset.lockedHeight = box.height.toString()
}

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
export function weightOf(size: ChildSize): number {
  if (size.kind === 'fixed') {
    return size.px
  }

  return size.ratio
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
function pickSizes(sizes: readonly ChildSize[], kept: readonly number[]): ChildSize[] {
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
 * Reads a layout tree from an unknown value (the parsed content of the storage).
 *
 * @remarks
 * The shape is validated, not the kinds: whether a kind is known is a question for
 * {@link toDockConfig}, which has the live widgets. Everything that is not a valid layout gives
 * `null`, and the caller falls back to the default.
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

  if (candidate.type === 'widget') {
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

    if (typeof width !== 'number' || typeof height !== 'number' || !isLockSize(width) || !isLockSize(height)) {
      return null
    }

    return { type: 'widget', kind: candidate.kind, lock: { width, height } }
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
      return child !== null
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
