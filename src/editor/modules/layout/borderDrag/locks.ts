import type { Widget } from '@lumino/widgets'
import { lockedBoxOf, lockWidgetTo, type LayoutNode, type LayoutNodeSplit, type LockBox } from '../layoutNode.ts'
import {
  axisOfSplit,
  borderAxisOf,
  gapsOf,
  isSameBox,
  parentOfSplits,
  parentSplitsOf,
  type BorderAxis,
  type DragRect,
} from './geometry.ts'

/**
 * The locks a border drag writes: which locked widgets a pressed border resizes, and by how much.
 *
 * @remarks
 * The **own** axis of a locked widget is the one its split distributes (the width of a widget in a row), the **cross**
 * axis is the one the parent split sets (the height of the same widget, which is the height of its row). A border drag
 * resizes one of them, and the size it leaves becomes the new lock — the drag is stronger than the lock, the decision of
 * the owner. A **container** drag changes the box of the split around the widget, but not the widget, so its lock is not
 * touched.
 *
 * The boxes are [`geometry.ts`](geometry.ts); the pointer is [`drag.ts`](drag.ts).
 */

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
 * The tolerance of the allocator of a held split, in pixels.
 */
const SIZE_TOLERANCE = 0.5

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
