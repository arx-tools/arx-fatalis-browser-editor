import type { ShallowRef } from 'vue'
import { commandOf, createSetUvRecord } from '../../../modules/history/records.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import {
  movedCorner,
  pannedBy,
  sameUvs,
  screenOfUv,
  snappedPoint,
  uvOfScreen,
  uvsOfFace,
  zoomAfter,
  type ShownFace,
  type StagePoint,
  type UvPoint,
  type UvView,
} from './uvMapper.ts'

/**
 * The pointer of the uv mapper: the drag of a corner, the drag of the texture, and the wheel of the zoom.
 *
 * @remarks
 * A corner is a **handle** over the square: the press takes it, the move writes the uv of the model (so the 3D view
 * follows the hand), and the release puts the change on the history. With `Shift` the corner is laid on the nearest 45
 * degree ray of the drag: a wall's texture is as wide as the wall above it, not a degree off (2026-11-05, the owner).
 *
 * The **texture** is dragged when no corner is under the pointer: the whole view slides, the way a map is dragged, and
 * what is under the hand stays under it.
 *
 * The widget owns the view (the size, the zoom, the pan and the reframe); the composable owns the gesture and the
 * corner/pan state it moves while it runs.
 */

/**
 * What the gesture reads and writes.
 */
export interface UvMapperDragContext {
  /**
   * The square itself: the pointer is measured from its top left corner.
   */
  readonly canvas: Readonly<ShallowRef<HTMLCanvasElement | null>>
  /**
   * The faces the edit writes into, or `undefined` when the selection can not be edited.
   */
  readonly shown: ShallowRef<ShownFace | undefined>
  /**
   * The uv of the corners of the face, as the model holds them.
   */
  readonly corners: ShallowRef<readonly UvPoint[]>
  /**
   * What the square draws: the size, the zoom and the place the view is centred on.
   */
  readonly view: ShallowRef<UvView>
  /**
   * The side of the square, in pixels.
   */
  readonly size: ShallowRef<number>
  /**
   * The zoom of the view.
   */
  readonly zoom: ShallowRef<number>
  /**
   * How far the view was dragged away from the face, in uv units.
   */
  readonly pan: ShallowRef<UvPoint>
  /**
   * Whether the texture is being dragged.
   */
  readonly panning: ShallowRef<boolean>
  /**
   * The corner the pointer drags, or `undefined` when nothing is dragged.
   */
  readonly dragged: ShallowRef<number | undefined>
  /**
   * The corner the caption reads: the one that was dragged last, so the numbers under the square stay on it.
   */
  readonly active: ShallowRef<number | undefined>
  /**
   * Draws the square again, after a live change.
   */
  readonly reframe: () => void
  /**
   * Asks for a frame, so the 3D view follows the drag without a bump per pointer event.
   */
  readonly requestRedraw: () => void
}

/**
 * The handlers of the pointer of the square.
 */
export interface UvMapperDrag {
  /**
   * Takes a corner for the drag.
   *
   * @param index The corner of the handle.
   * @param event The press that starts the drag.
   */
  readonly onPointerDown: (index: number, event: PointerEvent) => void
  /**
   * Moves the dragged corner, and the model with it.
   *
   * @param event The position of the drag.
   */
  readonly onPointerMove: (event: PointerEvent) => void
  /**
   * Ends the drag: the corner stays where it was let go, and the drag becomes a step of the history.
   *
   * @param event The release that ends the drag.
   */
  readonly onPointerUp: (event: PointerEvent) => void
  /**
   * Starts the drag of the texture.
   *
   * @param event The press that starts the drag.
   */
  readonly onPanStart: (event: PointerEvent) => void
  /**
   * Slides the view with the pointer.
   *
   * @param event The position of the drag.
   */
  readonly onPanMove: (event: PointerEvent) => void
  /**
   * Ends the drag of the texture.
   *
   * @param event The release that ends the drag.
   */
  readonly onPanEnd: (event: PointerEvent) => void
  /**
   * Zooms the square with the wheel of the pointer.
   *
   * @param event The turn of the wheel.
   */
  readonly onWheel: (event: WheelEvent) => void
}

/**
 * Builds the pointer gesture of the uv mapper.
 *
 * @param context What the gesture reads and writes.
 *
 * @returns The handlers the widget binds.
 */
export function useUvMapperDrag(context: UvMapperDragContext): UvMapperDrag {
  const { canvas, shown, corners, view, size, zoom, pan, panning, dragged, active, reframe, requestRedraw } = context

  /**
   * Where the drag of the texture started, in pixels of the square.
   */
  let panFrom: StagePoint | undefined

  /**
   * The corners the drag started from, so the step can be undone to the state before it.
   */
  let dragStart: readonly UvPoint[] | undefined

  /**
   * Reads the pointer in the pixels of the square.
   *
   * @param event The pointer event of the handle.
   *
   * @returns The place of the pointer, from the top left of the square.
   */
  function pointOf(event: PointerEvent): StagePoint {
    const box = canvas.value?.getBoundingClientRect()

    if (box === undefined) {
      return { x: 0, y: 0 }
    }

    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }

  /**
   * Puts a change of the corners into the model of every face of the selection.
   */
  function writeCorners(): void {
    const current = shown.value

    if (current === undefined) {
      return
    }

    for (const face of current.indices) {
      current.map.setFaceUvs(face, uvsOfFace(corners.value))
    }
  }

  /**
   * Puts a change of the corners on the history, when it changed anything.
   *
   * @param from The corners before the change.
   */
  function commit(from: readonly UvPoint[]): void {
    const current = shown.value

    if (current === undefined) {
      return
    }

    const command = commandOf(
      createSetUvRecord(current.indices, uvsOfFace(from), uvsOfFace(corners.value)),
      current.map,
    )

    if (command !== undefined) {
      runStep(command)
    }
  }

  return {
    onPointerDown: (index, event): void => {
      if (shown.value === undefined) {
        return
      }

      event.preventDefault()
      ;(event.currentTarget as Element | null)?.setPointerCapture(event.pointerId)
      dragged.value = index
      active.value = index
      dragStart = corners.value.map((corner) => {
        return { ...corner }
      })
      reframe()
    },
    onPointerMove: (event): void => {
      const index = dragged.value
      const current = shown.value

      if (index === undefined || current === undefined) {
        return
      }

      event.preventDefault()

      // with the shift held, the corner is laid on the nearest 45 degree ray of the drag: a wall's texture is as wide as
      // the wall above it, not a degree off (2026-11-05, the owner)
      const origin = dragStart?.[index]
      let target = pointOf(event)

      if (origin !== undefined && event.shiftKey) {
        target = snappedPoint(screenOfUv(view.value, origin), target)
      }

      corners.value = movedCorner(corners.value, index, uvOfScreen(view.value, target))

      writeCorners()
      reframe()
      requestRedraw()
    },
    onPointerUp: (event): void => {
      const index = dragged.value
      const from = dragStart

      ;(event.currentTarget as Element | null)?.releasePointerCapture(event.pointerId)
      dragged.value = undefined
      dragStart = undefined

      if (from === undefined || index === undefined || shown.value === undefined) {
        reframe()

        return
      }

      if (!sameUvs(from, corners.value)) {
        commit(from)
      }

      reframe()
    },
    onPanStart: (event): void => {
      event.preventDefault()
      ;(event.currentTarget as Element | null)?.setPointerCapture(event.pointerId)
      panning.value = true
      panFrom = pointOf(event)
    },
    onPanMove: (event): void => {
      const from = panFrom

      if (from === undefined) {
        return
      }

      const point = pointOf(event)

      pan.value = pannedBy(pan.value, { x: point.x - from.x, y: point.y - from.y }, size.value, zoom.value)
      panFrom = point
      reframe()
    },
    onPanEnd: (event): void => {
      ;(event.currentTarget as Element | null)?.releasePointerCapture(event.pointerId)
      panning.value = false
      panFrom = undefined
    },
    onWheel: (event): void => {
      // the wheel must not scroll the dock under the widget
      event.preventDefault()
      zoom.value = zoomAfter(zoom.value, event.deltaY)
      reframe()
    },
  }
}
