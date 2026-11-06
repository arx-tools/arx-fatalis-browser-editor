import type { LayoutNode, LayoutNodeSplit } from '../layoutNode.ts'

/**
 * The geometry of the borders of the dock: the boxes of the tree, the gaps between them and the handles.
 *
 * @remarks
 * A border of the dock is a **box** of the viewport (the handle lumino draws between two children), and the lock logic
 * has to know which split it belongs to: that is what this module computes from the tree and the boxes of the widgets —
 * `nodeBoxes` builds the box of every node, `gapBetween` reads the room two children leave, and
 * `parentSplitsOf`/`parentOfSplits` say how the splits nest.
 *
 * The **locks** the drag writes are [`locks.ts`](locks.ts); the pointer is [`drag.ts`](drag.ts).
 */

/**
 * The axis a border of the dock resizes.
 *
 * @remarks
 * The border of a **horizontal** split stands between two children side by side, so it moves their widths; the border of
 * a vertical split moves heights. The direction is read off the box of the handle, which is the reverse of the split: a
 * tall handle holds two columns apart.
 */
export type BorderAxis = 'width' | 'height'

/**
 * A box of the dock, in the coordinates of the viewport.
 */
export interface DragRect {
  /**
   * The distance of the left edge from the left edge of the viewport.
   */
  readonly left: number
  /**
   * The distance of the top edge from the top edge of the viewport.
   */
  readonly top: number
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
 * The float arithmetic of the boxes and the rounding of the browser: this much difference is not a difference.
 */
const BOX_TOLERANCE = 2

/**
 * Reads the right edge of a box.
 *
 * @param rect The box.
 *
 * @returns The distance of the right edge from the left edge of the viewport.
 */
function rightOf(rect: DragRect): number {
  return rect.left + rect.width
}

/**
 * Reads the bottom edge of a box.
 *
 * @param rect The box.
 *
 * @returns The distance of the bottom edge from the top edge of the viewport.
 */
function bottomOf(rect: DragRect): number {
  return rect.top + rect.height
}

/**
 * Tells whether two edges are at the same place, up to the rounding of the browser.
 *
 * @param first The first edge.
 * @param second The second edge.
 *
 * @returns True when the two are {@link BOX_TOLERANCE} apart at most.
 */
export function isNear(first: number, second: number): boolean {
  return Math.abs(first - second) <= BOX_TOLERANCE
}

/**
 * Tells whether two boxes are the same box, up to the rounding of the browser.
 *
 * @param first The box to compare.
 * @param second The box it is compared to.
 *
 * @returns True when every edge of the two is the same.
 */
export function isSameBox(first: DragRect, second: DragRect): boolean {
  return (
    isNear(first.left, second.left) &&
    isNear(first.top, second.top) &&
    isNear(first.width, second.width) &&
    isNear(first.height, second.height)
  )
}

/**
 * Reads the axis a split distributes.
 *
 * @param node The split to read the axis of.
 *
 * @returns The width for a horizontal split, the height for a vertical one.
 */
export function axisOfSplit(node: LayoutNodeSplit): BorderAxis {
  if (node.orientation === 'horizontal') {
    return 'width'
  }

  return 'height'
}

/**
 * Reads the axis the border of a handle resizes.
 *
 * @param handle The box of the handle: the handle of a horizontal split is the tall one.
 *
 * @returns The width for a vertical border, the height for a horizontal one.
 */
export function borderAxisOf(handle: DragRect): BorderAxis {
  if (handle.height > handle.width) {
    return 'width'
  }

  return 'height'
}

/**
 * Reads the box a gap between two neighbouring children of a split takes.
 *
 * @param first The child before the gap, in the order of the split.
 * @param second The child after the gap.
 * @param axis The axis the split distributes.
 * @param spacing The room a gap takes.
 *
 * @returns The box of the gap, or `undefined` when the two are not neighbours along that axis.
 */
export function gapBetween(first: DragRect, second: DragRect, axis: BorderAxis, spacing: number): DragRect | undefined {
  if (axis === 'width') {
    if (!isNear(first.top, second.top) || !isNear(bottomOf(first), bottomOf(second))) {
      return undefined
    }

    const room = second.left - rightOf(first)

    if (!isNear(room, spacing)) {
      return undefined
    }

    return { left: rightOf(first), top: first.top, width: room, height: first.height }
  }

  if (!isNear(first.left, second.left) || !isNear(rightOf(first), rightOf(second))) {
    return undefined
  }

  const room = second.top - bottomOf(first)

  if (!isNear(room, spacing)) {
    return undefined
  }

  return { left: first.left, top: bottomOf(first), width: first.width, height: room }
}

/**
 * Adds up the boxes of a number of nodes.
 *
 * @param boxes The boxes to add up.
 *
 * @returns The box of the union, or `undefined` when there is no box to take.
 */
export function unionOf(boxes: readonly DragRect[]): DragRect | undefined {
  const first = boxes[0]

  if (first === undefined) {
    return undefined
  }

  let { left, top } = first
  let right = rightOf(first)
  let bottom = bottomOf(first)

  for (const box of boxes) {
    left = Math.min(left, box.left)
    top = Math.min(top, box.top)
    right = Math.max(right, rightOf(box))
    bottom = Math.max(bottom, bottomOf(box))
  }

  return { left, top, width: right - left, height: bottom - top }
}

/**
 * Reads the box of every node of the tree, from the boxes of the widgets.
 *
 * @remarks
 * The dock has no element of its own for a split: the areas are laid out flat, so the box of a split is the union of
 * the boxes of its leaves. A widget that is not on the dock (it is hidden, or it was disposed) is left out, and so is
 * the node that has no widget left under it.
 *
 * @param tree The tree to walk.
 * @param rectOf Reads the box of a widget kind, or `undefined` when the widget is not on the dock.
 *
 * @returns The box of every node that has a widget under it.
 */
export function nodeBoxes(tree: LayoutNode, rectOf: (kind: string) => DragRect | undefined): Map<LayoutNode, DragRect> {
  const boxes = new Map<LayoutNode, DragRect>()

  /**
   * Walks one node, writing the boxes of it and of its children.
   *
   * @param node The node to walk.
   *
   * @returns The box of the node, or `undefined` when nothing under it is on the dock.
   */
  function walk(node: LayoutNode): DragRect | undefined {
    if (node.type === 'empty') {
      return undefined
    }

    if (node.type === 'widget') {
      const rect = rectOf(node.kind)

      if (rect === undefined) {
        return undefined
      }

      boxes.set(node, rect)

      return rect
    }

    const children: DragRect[] = []

    for (const child of node.children) {
      const box = walk(child)

      if (box !== undefined) {
        children.push(box)
      }
    }

    const box = unionOf(children)

    if (box !== undefined) {
      boxes.set(node, box)
    }

    return box
  }

  walk(tree)

  return boxes
}

/**
 * Reads the split that holds every widget of the tree directly.
 *
 * @param tree The tree to walk.
 *
 * @returns The split of the widget kinds that are a direct child of a split.
 */
export function parentSplitsOf(tree: LayoutNode): Map<string, LayoutNodeSplit> {
  const parents = new Map<string, LayoutNodeSplit>()

  /**
   * Walks one node of the tree.
   *
   * @param node The node to walk.
   */
  function walk(node: LayoutNode): void {
    // only a split has children: a widget is a leaf, and the empty layout is the root of an empty dock
    if (node.type !== 'split') {
      return
    }

    for (const child of node.children) {
      if (child.type === 'widget') {
        parents.set(child.kind, node)
      }

      walk(child)
    }
  }

  walk(tree)

  return parents
}

/**
 * Reads the split that holds a split of the tree.
 *
 * @param tree The tree to walk.
 *
 * @returns The split of every split below the root.
 */
export function parentOfSplits(tree: LayoutNode): Map<LayoutNode, LayoutNodeSplit> {
  const parents = new Map<LayoutNode, LayoutNodeSplit>()

  /**
   * Walks one node of the tree.
   *
   * @param node The node to walk.
   */
  function walk(node: LayoutNode): void {
    // only a split has children: a widget is a leaf, and the empty layout is the root of an empty dock
    if (node.type !== 'split') {
      return
    }

    for (const child of node.children) {
      if (child.type === 'split') {
        parents.set(child, node)
      }

      walk(child)
    }
  }

  walk(tree)

  return parents
}

/**
 * Reads the boxes of the gaps of a split.
 *
 * @param node The split.
 * @param boxes The boxes of the nodes.
 * @param spacing The room a gap takes.
 *
 * @returns The box of every gap between two children, in the order of the split.
 */
export function gapsOf(node: LayoutNodeSplit, boxes: ReadonlyMap<LayoutNode, DragRect>, spacing: number): DragRect[] {
  const axis = axisOfSplit(node)
  const gaps: DragRect[] = []

  for (const [index, child] of node.children.entries()) {
    const next = node.children[index + 1]

    if (next === undefined) {
      continue
    }

    const first = boxes.get(child)
    const second = boxes.get(next)

    if (first === undefined || second === undefined) {
      continue
    }

    const gap = gapBetween(first, second, axis, spacing)

    if (gap !== undefined) {
      gaps.push(gap)
    }
  }

  return gaps
}
