import type { Widget } from '@lumino/widgets'
import { lockedBoxOf, lockWidgetTo, type LayoutNode, type LayoutNodeSplit, type LockBox } from './layoutNode.ts'
import { widgetKind } from './widgetDefinition.ts'

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
 * The state of a border drag.
 */
interface DragState {
  /**
   * The locked widgets the border resizes, by kind.
   */
  readonly targets: ReadonlyMap<string, BorderDragTarget>
  /**
   * The splits the drag has to lay out again by hand.
   */
  readonly holds: readonly HeldSplit[]
  /**
   * The widgets of the dock at the press, by kind.
   */
  readonly widgets: ReadonlyMap<string, Widget>
  /**
   * The room a gap between two children takes.
   */
  readonly spacing: number
  /**
   * Where the pointer was pressed.
   */
  readonly press: { readonly x: number; readonly y: number }
  /**
   * Whether the pointer moved at all: a press without a move changes nothing.
   */
  moved: boolean
  /**
   * The frame the next correction waits for, or `undefined` when none is asked for.
   */
  frame: number | undefined
}

/**
 * What the drag watcher needs from the dock.
 */
export interface BorderDragContext {
  /**
   * Reads the live layout tree of the dock.
   *
   * @returns The tree, or `null` when the dock has no layout to read.
   */
  readonly tree: () => LayoutNode | null
  /**
   * Reads the live widgets of the dock.
   *
   * @returns The widgets, in no particular order.
   */
  readonly widgets: () => readonly Widget[]
  /**
   * The room a gap between two children of a split takes, in pixels.
   */
  readonly spacing: number
  /**
   * Called when a drag ended (or was cancelled): the caller lays the dock out again from the locks and writes the
   * layout down.
   */
  readonly onEnded: () => void
}

/**
 * The handle of a running watcher.
 */
export interface BorderDragWatcher {
  /**
   * Tells whether a border is being dragged right now.
   *
   * @remarks
   * A rebuild of the dock inside a drag takes the handle away from under the pointer, so the caller has to wait for the
   * drag to end before it lays the dock out again.
   *
   * @returns True while the pointer is on a border with the button pressed.
   */
  readonly isActive: () => boolean
  /**
   * Stops watching the pointer.
   */
  readonly dispose: () => void
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
 * The selector of a handle of the dock.
 */
const HANDLE_SELECTOR = '.lm-DockPanel-handle'

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
function isNear(first: number, second: number): boolean {
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
 * Reads the size of a box along an axis.
 *
 * @param rect The box.
 * @param axis The axis to measure.
 *
 * @returns The width or the height of the box.
 */
function sizeAlong(rect: DragRect, axis: BorderAxis): number {
  if (axis === 'width') {
    return rect.width
  }

  return rect.height
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
function unionOf(boxes: readonly DragRect[]): DragRect | undefined {
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
function gapsOf(node: LayoutNodeSplit, boxes: ReadonlyMap<LayoutNode, DragRect>, spacing: number): DragRect[] {
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
 * Places a node of the dock at a box of the viewport.
 *
 * @remarks
 * The box comes in the coordinates of the viewport, while lumino positions the nodes in the coordinates of the dock: the
 * origin of the dock is taken out of the box. The styles are written every frame of a drag, and the next layout of the
 * dock overwrites them, so nothing of this survives a pass.
 *
 * @param element The node to place.
 * @param box The box it takes.
 * @param origin The box of the dock.
 */
function placeNode(element: HTMLElement, box: DragRect, origin: DragRect): void {
  const { style } = element

  style.left = `${box.left - origin.left}px`
  style.top = `${box.top - origin.top}px`
  style.width = `${box.width}px`
  style.height = `${box.height}px`
}

/**
 * Lays a held split out again: the locked children keep their size, the free ones take the rest.
 *
 * @remarks
 * The split is laid out inside the box it has now, so the parts of the dock around it stay where the drag put them. The
 * sizes are scaled to fill that box exactly, otherwise a fraction of a pixel would leave a seam next to the neighbour of
 * the split.
 *
 * @param hold The split to lay out.
 * @param spacing The room a gap between two children takes.
 * @param origin The box of the dock.
 */
export function holdSplit(hold: HeldSplit, spacing: number, origin: DragRect): void {
  const boxes: DragRect[] = []

  for (const child of hold.children) {
    const rect = child.widget.node.getBoundingClientRect()

    boxes.push({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }

  const box = unionOf(boxes)

  if (box === undefined || isNear(sizeAlong(hold.box, hold.axis), sizeAlong(box, hold.axis))) {
    return
  }

  const gaps = Math.max(0, hold.children.length - 1)
  const roomForGaps = spacing * gaps
  const available = Math.max(0, sizeAlong(box, hold.axis) - roomForGaps)
  const sizes = heldSizes(
    hold.children.map((child) => {
      return child.size
    }),
    hold.children.map((child) => {
      return child.locked
    }),
    available,
  )

  // the last child takes what the rounding of the others left, so the split fills its box exactly
  const last = sizes.length - 1
  let placed = 0

  for (let index = 0; index < last; index = index + 1) {
    placed = placed + (sizes[index] ?? 0)
  }

  sizes[last] = Math.max(0, available - placed)

  let position = 0

  for (const [index, child] of hold.children.entries()) {
    const size = sizes[index] ?? 0
    let widgetBox: DragRect = { left: box.left, top: box.top + position, width: box.width, height: size }

    if (hold.axis === 'width') {
      widgetBox = { left: box.left + position, top: box.top, width: size, height: box.height }
    }

    placeNode(child.widget.node, widgetBox, origin)

    const handle = hold.handles[index]

    if (handle !== undefined) {
      let handleBox: DragRect = {
        left: box.left,
        top: box.top + position + size,
        width: box.width,
        height: spacing,
      }

      if (hold.axis === 'width') {
        handleBox = { left: box.left + position + size, top: box.top, width: spacing, height: box.height }
      }

      placeNode(handle, handleBox, origin)
    }

    position = position + size + spacing
  }
}

/**
 * Reads the visible handles of the dock.
 *
 * @param host The element the dock is attached to.
 *
 * @returns The handles the user can press.
 */
export function visibleHandles(host: HTMLElement): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(HANDLE_SELECTOR)].filter((handle) => {
    return !handle.classList.contains('lm-mod-hidden')
  })
}

/**
 * Reads the box of a widget.
 *
 * @param widget The widget to read.
 *
 * @returns Its box, or `undefined` when the widget is hidden or takes no room.
 */
function rectOfWidget(widget: Widget): DragRect | undefined {
  if (widget.isHidden) {
    return undefined
  }

  const box = widget.node.getBoundingClientRect()

  if (box.width <= 0 || box.height <= 0) {
    return undefined
  }

  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

/**
 * Reads the splits that have to be laid out by hand while a border is dragged.
 *
 * @remarks
 * A split is held when one of its children is locked: the drag may resize the box of that split (a row gets wider with
 * its column), and the correction keeps the locked child at its size. The children of the split have to be widgets — a
 * split under a split has no node of its own to place — and every gap of it needs its handle, or the correction would
 * move the children away from the handle between them.
 *
 * @param board The dock as the press saw it.
 *
 * @returns Every split to hold, with the sizes its children had before the drag.
 */
export function heldSplitsOf(board: DragBoard): HeldSplit[] {
  const holds: HeldSplit[] = []

  /**
   * Reads the children of a split, or `undefined` when one of them is not a widget on the dock.
   *
   * @param node The split to read.
   *
   * @returns The children in their order, with the size they had along the axis of the split.
   */
  function childrenOf(node: LayoutNodeSplit): HeldChild[] | undefined {
    const axis = axisOfSplit(node)
    const children: HeldChild[] = []

    for (const child of node.children) {
      if (child.type !== 'widget') {
        return undefined
      }

      const widget = board.widgets.get(child.kind)
      const box = board.boxes.get(child)

      if (widget === undefined || box === undefined) {
        return undefined
      }

      children.push({ widget, size: sizeAlong(box, axis), locked: board.locked.has(child.kind) })
    }

    return children
  }

  /**
   * Reads the handles that stand between the children of a split.
   *
   * @param node The split to read.
   *
   * @returns The handle of every gap, or `undefined` when one of them is missing.
   */
  function handlesOf(node: LayoutNodeSplit): HTMLElement[] | undefined {
    const found: HTMLElement[] = []
    const gaps = gapsOf(node, board.boxes, board.spacing)

    if (gaps.length === 0) {
      return undefined
    }

    for (const gap of gaps) {
      const handle = board.handles.find((candidate) => {
        const box = candidate.getBoundingClientRect()

        return isSameBox({ left: box.left, top: box.top, width: box.width, height: box.height }, gap)
      })

      if (handle === undefined) {
        return undefined
      }

      found.push(handle)
    }

    return found
  }

  /**
   * Walks one node of the tree.
   *
   * @param node The node to walk.
   */
  function walk(node: LayoutNode): void {
    if (node.type === 'widget') {
      return
    }

    const children = childrenOf(node)
    const box = board.boxes.get(node)
    let holdsLock = false

    if (children !== undefined) {
      holdsLock = children.some((child) => {
        return child.locked
      })
    }

    if (holdsLock && children !== undefined && box !== undefined) {
      const found = handlesOf(node)

      if (found !== undefined) {
        holds.push({ axis: axisOfSplit(node), box, children, handles: found })
      }
    }

    for (const child of node.children) {
      walk(child)
    }
  }

  walk(board.tree)

  return holds
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

/**
 * Reads the dock as the press saw it.
 *
 * @param tree The live tree of the dock.
 * @param widgets The live widgets, by kind.
 * @param handles The visible handles of the dock.
 * @param spacing The room a gap between two children takes.
 *
 * @returns The board the classification reads.
 */
export function boardOf(
  tree: LayoutNode,
  widgets: ReadonlyMap<string, Widget>,
  handles: readonly HTMLElement[],
  spacing: number,
): DragBoard {
  const rects = new Map<string, DragRect>()
  const locked = new Set<string>()

  for (const [kind, widget] of widgets) {
    const rect = rectOfWidget(widget)

    if (rect === undefined) {
      continue
    }

    rects.set(kind, rect)

    if (lockedBoxOf(widget) !== undefined) {
      locked.add(kind)
    }
  }

  return {
    tree,
    boxes: nodeBoxes(tree, (kind) => {
      return rects.get(kind)
    }),
    widgets,
    locked,
    handles,
    spacing,
  }
}

/**
 * Watches the pointer for the border drags of the dock.
 *
 * @remarks
 * Lumino drives the border with the pointer events of the document, and it stops the press before it could bubble, so
 * the press is caught on the way down, in the capture phase. While the border is dragged, the locked children of the
 * splits it may resize are kept at their size by hand (see {@link holdSplit}); when the pointer goes up, a border that
 * resized a locked widget writes its lock, and the caller lays the dock out again from the locks. The drag of a *widget*
 * (the edit mode) never comes here: it starts on the overlay of the widget, not on a handle.
 *
 * @param host The element the dock is attached to.
 * @param context What the watcher reads from the dock.
 *
 * @returns The handle of the watcher.
 */
export function watchBorderDrag(host: HTMLElement, context: BorderDragContext): BorderDragWatcher {
  let state: DragState | undefined

  /**
   * Reads the live widgets of the dock, by kind.
   *
   * @returns Every widget of the dock that carries a kind.
   */
  function widgetsByKind(): Map<string, Widget> {
    const widgets = new Map<string, Widget>()

    for (const widget of context.widgets()) {
      const kind = widgetKind(widget)

      if (kind !== undefined) {
        widgets.set(kind, widget)
      }
    }

    return widgets
  }

  /**
   * Starts a drag when a handle of the dock is pressed.
   *
   * @param event The press of the pointer.
   */
  function start(event: PointerEvent): void {
    if (state !== undefined || event.button !== 0) {
      return
    }

    const { target } = event

    if (!(target instanceof Element)) {
      return
    }

    const handle = target.closest(HANDLE_SELECTOR)

    if (!(handle instanceof HTMLElement) || !host.contains(handle)) {
      return
    }

    if (handle.classList.contains('lm-mod-hidden')) {
      return
    }

    const tree = context.tree()

    if (tree === null) {
      return
    }

    const widgets = widgetsByKind()
    const board = boardOf(tree, widgets, visibleHandles(host), context.spacing)
    const box = handle.getBoundingClientRect()
    const handleRect: DragRect = { left: box.left, top: box.top, width: box.width, height: box.height }

    state = {
      targets: dragTargetsOf(board, handleRect),
      holds: heldSplitsOf(board),
      widgets,
      spacing: board.spacing,
      press: { x: event.clientX, y: event.clientY },
      moved: false,
      frame: undefined,
    }
  }

  /**
   * Corrects the held splits, once per frame.
   *
   * @remarks
   * Lumino lays the dock out inside the pointermove event, so the correction waits for the frame after it: a
   * `requestAnimationFrame` callback runs before the browser paints, so the frame the user sees is the corrected one.
   */
  function correct(): void {
    const current = state

    if (current === undefined) {
      return
    }

    const origin = host.querySelector<HTMLElement>('.lm-DockPanel')?.getBoundingClientRect()

    if (origin === undefined) {
      return
    }

    const box: DragRect = { left: origin.left, top: origin.top, width: origin.width, height: origin.height }

    for (const hold of current.holds) {
      holdSplit(hold, current.spacing, box)
    }
  }

  /**
   * Requests a correction for the next frame, if none is asked for yet.
   */
  function requestCorrection(): void {
    const current = state

    if (current === undefined || current.frame !== undefined) {
      return
    }

    current.frame = requestAnimationFrame(() => {
      if (state !== undefined) {
        state.frame = undefined
      }

      correct()
    })
  }

  /**
   * Follows the pointer while a border is dragged.
   *
   * @param event The move of the pointer.
   */
  function move(event: PointerEvent): void {
    const current = state

    if (current === undefined) {
      return
    }

    if (!current.moved) {
      if (event.clientX === current.press.x && event.clientY === current.press.y) {
        return
      }

      current.moved = true
    }

    requestCorrection()
  }

  /**
   * Ends the drag: the locks the border resized are written, and the caller lays the dock out again.
   *
   * @param cancelled Whether the drag was cancelled (the escape key): nothing is written then, and the layout goes back
   * to the sizes of the locks.
   */
  function end(cancelled = false): void {
    const current = state

    if (current === undefined) {
      return
    }

    state = undefined

    if (current.frame !== undefined) {
      cancelAnimationFrame(current.frame)
    }

    if (!current.moved) {
      return
    }

    if (!cancelled) {
      applyDragEdges(current.targets, (kind) => {
        return current.widgets.get(kind)
      })
    }

    context.onEnded()
  }

  /**
   * Cancels the drag when the escape key is pressed.
   *
   * @param event The keydown event of the document.
   */
  function cancel(event: KeyboardEvent): void {
    if (state !== undefined && event.key === 'Escape') {
      end(true)
    }
  }

  /**
   * Ends the drag when the pointer is released.
   */
  function release(): void {
    end()
  }

  /**
   * Ends the drag when the window loses the focus.
   *
   * @remarks
   * The pointerup of a drag that leaves the window never arrives, and the pattern is not just the missing lock: the
   * watcher would stay active, and the pass would wait for a drag that is over. A lost focus counts as a cancel.
   */
  function blur(): void {
    end(true)
  }

  document.addEventListener('pointerdown', start, { capture: true })
  document.addEventListener('pointermove', move, { capture: true })
  document.addEventListener('pointerup', release, { capture: true })
  document.addEventListener('pointercancel', release, { capture: true })
  document.addEventListener('keydown', cancel, { capture: true })
  window.addEventListener('blur', blur)

  return {
    isActive: (): boolean => {
      return state !== undefined
    },
    dispose: (): void => {
      document.removeEventListener('pointerdown', start, { capture: true })
      document.removeEventListener('pointermove', move, { capture: true })
      document.removeEventListener('pointerup', release, { capture: true })
      document.removeEventListener('pointercancel', release, { capture: true })
      document.removeEventListener('keydown', cancel, { capture: true })
      window.removeEventListener('blur', blur)
      state = undefined
    },
  }
}
