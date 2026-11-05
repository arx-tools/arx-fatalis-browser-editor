import type { Widget } from '@lumino/widgets'
import { lockedBoxOf, lockWidgetTo, type LayoutNode, type LayoutNodeSplit, type LockBox } from '../layoutNode.ts'

/**
 * The geometry and the locks of a border drag of the dock.
 *
 * @remarks
 * The drag of a border between two widgets of the dock has two halves: this one reads the **boxes** of the layout and
 * decides what the drag would resize ({@link dragTargetsOf}, {@link heldSizes}), and it writes the **locks** the drag
 * made ({@link applyDragEdges}). Nothing here touches the pointer or the DOM events: the events are
 * [`drag.ts`](drag.ts), which builds a {@link DragBoard} from the live dock and drives this half.
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
 * Which axis of a locked widget a border resizes.
 *
 * @remarks
 * The **own** axis is the axis the split of the widget distributes (the width of a widget in a row); the **cross** axis
 * is the other one, which the parent split sets (the height of the same widget, which is the height of its row).
 */
export type BorderDragEdge = 'own' | 'cross'

/**
 * What a pressed border does to one locked widget.
 */
export interface BorderDragTarget {
  /**
   * Which of the two axes of the widget the border resizes.
   */
  readonly edge: BorderDragEdge
  /**
   * The axis the lock has to be written on.
   */
  readonly axis: BorderAxis
}

/**
 * A child of a split as the live drag sees it: the widget, its size before the drag, and whether it is locked.
 */
export interface HeldChild {
  /**
   * The live widget.
   */
  readonly widget: Widget
  /**
   * The size it had along the axis of the split when the border was pressed.
   */
  readonly size: number
  /**
   * Whether the widget keeps its size (it is locked).
   */
  readonly locked: boolean
}

/**
 * A split that has to be laid out again by hand while a border of a container is dragged.
 *
 * @remarks
 * The dock lays the children of a split out from the shares of the border that is dragged and from the sizes the split
 * had, so the sizes of a child follow the container: a locked widget would stretch with it, and the pass would snap it
 * back when the pointer goes up. The correction keeps the locked children at their size and gives the rest of the space
 * to the free ones, frame by frame, so nothing jumps at the end.
 */
export interface HeldSplit {
  /**
   * The axis the split distributes.
   */
  readonly axis: BorderAxis
  /**
   * The box of the split when the border was pressed.
   */
  readonly box: DragRect
  /**
   * The children of the split, in their order along the axis.
   */
  readonly children: readonly HeldChild[]
  /**
   * The handles between the children, in the same order as the gaps.
   */
  readonly handles: readonly HTMLElement[]
}

/**
 * The dock as the drag sees it when a border is pressed.
 *
 * @remarks
 * The boxes are read from the DOM once, at the press: the geometry of the dock changes under the drag, and the
 * classification has to answer the question the user asked when the border was grabbed.
 */
export interface DragBoard {
  /**
   * The live tree of the dock.
   */
  readonly tree: LayoutNode
  /**
   * The box of every node of the tree that has a widget under it.
   */
  readonly boxes: ReadonlyMap<LayoutNode, DragRect>
  /**
   * The widgets of the dock, by kind.
   */
  readonly widgets: ReadonlyMap<string, Widget>
  /**
   * The kinds of the widgets that are locked.
   */
  readonly locked: ReadonlySet<string>
  /**
   * The visible handles of the dock.
   */
  readonly handles: readonly HTMLElement[]
  /**
   * The room a gap between two children of a split takes.
   */
  readonly spacing: number
}

/**
 * The float arithmetic of the boxes and the rounding of the browser: this much difference is not a difference.
 */
const BOX_TOLERANCE = 2

/**
 * The tolerance of the allocator of a held split, in pixels.
 */
const SIZE_TOLERANCE = 0.5

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
    if (node.type === 'widget') {
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
    if (node.type === 'widget') {
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

/**
 * Tells whether the pressed handle is the border between two children of a split.
 *
 * @param node The split to check.
 * @param boxes The boxes of the nodes.
 * @param handle The box of the handle.
 * @param spacing The room a gap takes.
 *
 * @returns True when one of the gaps of the split is the box of the handle.
 */
function hasBorder(
  node: LayoutNodeSplit,
  boxes: ReadonlyMap<LayoutNode, DragRect>,
  handle: DragRect,
  spacing: number,
): boolean {
  for (const gap of gapsOf(node, boxes, spacing)) {
    if (isSameBox(gap, handle)) {
      return true
    }
  }

  return false
}

/**
 * Classifies a pressed border: which locked widgets it resizes, and on which axis.
 *
 * @remarks
 * There are three cases, and only two of them write the lock.
 *
 * When the border is inside the split of the widget — it stands between the widget and one of its siblings — the drag
 * resizes the **own** axis of the widget (the width of the widget in its row), and that size becomes its new lock.
 *
 * When the border is the edge of that split, on the split above it, the drag resizes the **cross** axis (the height of
 * the widget in its row is the height of the row), and that size becomes the new lock.
 *
 * Anything else is a **container** drag for the widget: it may resize the box of the split (a row gets wider when the
 * column around it does), but the widget keeps its size, so its lock is not touched.
 *
 * The walk goes from the border outwards, so a drag that stands between the widget and its sibling is never taken for a
 * container drag of a bigger split.
 *
 * @param board The dock as the press saw it.
 * @param handle The box of the pressed handle.
 *
 * @returns The target of every locked widget the border resizes; a locked widget that is not in the map is not resized
 * by the border.
 */
export function dragTargetsOf(board: DragBoard, handle: DragRect): Map<string, BorderDragTarget> {
  const axis = borderAxisOf(handle)
  const parents = parentSplitsOf(board.tree)
  const grandparents = parentOfSplits(board.tree)
  const targets = new Map<string, BorderDragTarget>()

  for (const kind of board.locked) {
    const split = parents.get(kind)

    if (split === undefined) {
      continue
    }

    if (axisOfSplit(split) === axis && hasBorder(split, board.boxes, handle, board.spacing)) {
      targets.set(kind, { edge: 'own', axis })

      continue
    }

    const parent = grandparents.get(split)

    if (parent === undefined || axisOfSplit(parent) !== axis || axisOfSplit(parent) === axisOfSplit(split)) {
      continue
    }

    if (hasBorder(parent, board.boxes, handle, board.spacing)) {
      targets.set(kind, { edge: 'cross', axis })
    }
  }

  return targets
}

/**
 * Distributes the space of a split among its children, keeping the size of the held ones.
 *
 * @remarks
 * The free children share what the held ones leave, in the proportion of the sizes they had: that is the same share the
 * managed pass works out from the ratios of the layout, because those ratios were read from the same sizes. When the
 * space is too small even for the held sizes, everything shrinks together — a lock is the will of the user, but a window
 * has no room and the widget has to follow it (the decision of the owner).
 *
 * @param sizes The size of every child before the drag.
 * @param held Whether the child keeps its size.
 * @param available The space the children share, the gaps already taken out of it.
 *
 * @returns The size of every child, in the same order.
 */
export function heldSizes(sizes: readonly number[], held: readonly boolean[], available: number): number[] {
  let total = 0
  let heldTotal = 0

  for (const [index, size] of sizes.entries()) {
    total = total + size

    if (held[index] ?? false) {
      heldTotal = heldTotal + size
    }
  }

  const freeTotal = total - heldTotal

  if (total <= SIZE_TOLERANCE || available <= 0) {
    return [...sizes]
  }

  // nothing to hold on to, or no room even for the held sizes: the sizes follow the space
  if (freeTotal <= SIZE_TOLERANCE || available <= heldTotal + SIZE_TOLERANCE) {
    const factor = available / total

    return sizes.map((size) => {
      return size * factor
    })
  }

  const factor = (available - heldTotal) / freeTotal

  return sizes.map((size, index) => {
    if (held[index] ?? false) {
      return size
    }

    return size * factor
  })
}

/**
 * Writes the locks a drag resized.
 *
 * @remarks
 * The drag is stronger than the lock (the decision of the owner): the size the border gave a locked widget becomes its
 * new lock, so it keeps that size when the window changes again. Only the axis the border resized is written: the other
 * side of the lock stays the size the widget had, and a container drag never writes anything.
 *
 * @param targets The locked widgets the drag resizes, by kind.
 * @param widgetOf Reads the live widget of a kind.
 *
 * @returns Whether any lock changed.
 */
export function applyDragEdges(
  targets: ReadonlyMap<string, BorderDragTarget>,
  widgetOf: (kind: string) => Widget | undefined,
): boolean {
  let changed = false

  for (const [kind, target] of targets) {
    const widget = widgetOf(kind)

    if (widget === undefined) {
      continue
    }

    const box = lockedBoxOf(widget)

    if (box === undefined) {
      continue
    }

    const rect = widget.node.getBoundingClientRect()
    const width = Math.round(rect.width)
    const height = Math.round(rect.height)
    let next: LockBox = box

    if (target.axis === 'width' && width > 0) {
      next = { width, height: box.height }
    } else if (target.axis === 'height' && height > 0) {
      next = { width: box.width, height }
    }

    if (next.width !== box.width || next.height !== box.height) {
      lockWidgetTo(widget, next)
      changed = true
    }
  }

  return changed
}
