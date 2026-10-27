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
 *     { type: 'widget', kind: 'view3d' },
 *     {
 *       type: 'split',
 *       orientation: 'vertical',
 *       sizes: [0.5, 0.5],
 *       children: [
 *         { type: 'widget', kind: 'statistics' },
 *         { type: 'widget', kind: 'help' },
 *       ],
 *     },
 *   ],
 * }
 * ```
 */
export type LayoutNode = LayoutNodeSplit | LayoutNodeWidget

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
   * The relative sizes of the children, in the order of `children`.
   */
  readonly sizes: readonly number[]
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
    return Math.abs(size - (second.sizes[index] ?? 0)) <= SIZE_EPSILON
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
 * @returns The sizes of the kept children, normalized to one.
 */
function pickSizes(sizes: readonly number[], kept: readonly number[]): number[] {
  const picked = kept.map((index) => {
    return sizes[index] ?? 0
  })
  const total = picked.reduce((sum, size) => {
    return sum + size
  }, 0)

  if (total <= 0) {
    return picked.map(() => {
      return 1 / picked.length
    })
  }

  return picked.map((size) => {
    return size / total
  })
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

    return { type: 'widget', kind }
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

  return { type: 'split', orientation: main.orientation, sizes: pickSizes(main.sizes, kept), children }
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
 *
 * @returns The config for `restoreLayout`, or `null` when the tree can not be built.
 */
export function toDockConfig(
  node: LayoutNode,
  widgetOf: (kind: string) => Widget | undefined,
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
    const area = toDockConfig(child, widgetOf)?.main

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
      sizes: pickSizes(node.sizes, kept),
      children,
    },
  }
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

    return { type: 'widget', kind: candidate.kind }
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

  const sizes = candidate.sizes.filter((size): size is number => {
    return typeof size === 'number' && Number.isFinite(size) && size > 0
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
