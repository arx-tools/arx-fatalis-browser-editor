import type { Widget } from '@lumino/widgets'
import { lockedBoxOf, type LayoutNode, type LayoutNodeSplit } from '../layoutNode.ts'
import { widgetKind } from '../widgetDefinition.ts'
import {
  axisOfSplit,
  gapsOf,
  isNear,
  isSameBox,
  nodeBoxes,
  unionOf,
  type BorderAxis,
  type DragRect,
} from './geometry.ts'
import {
  applyDragEdges,
  dragTargetsOf,
  heldSizes,
  type BorderDragTarget,
  type DragBoard,
  type HeldChild,
  type HeldSplit,
} from './locks.ts'

/**
 * The pointer side of a border drag of the dock.
 *
 * @remarks
 * Lumino drives the borders with the pointer events of the document, and it keeps its own layout: this module catches
 * the press, reads the dock as a {@link DragBoard}, and holds the locked splits at their size by hand while the border
 * moves ({@link holdSplit}). What the drag *means* — which lock it resizes, whether it resized anything — is the
 * geometry of [`model.ts`](model.ts).
 */

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
 * The selector of a handle of the dock.
 */
const HANDLE_SELECTOR = '.lm-DockPanel-handle'

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
