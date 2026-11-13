import type { ArxVector3 } from 'arx-convert/types'
import type { OrthographicCamera } from 'three'
import type { Ref } from 'vue'
import { selectionModeOf, type SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { gamePositionToWorld, worldPositionToGame } from '../camera/cameraPose.ts'
import type { ViewScene } from '../shared/viewScene.ts'
import type { CameraViewMode } from './cameraAlign.ts'
import { MAX_ZOOM } from './fixedView.ts'
import { planePointAt, targetPositionOf } from './fixedViewTarget.ts'

/**
 * How much one pixel of the wheel turns the zoom.
 *
 * @remarks
 * The exponential keeps every step the same size, whatever the current zoom is, and the wheel back is always the exact
 * inverse of the wheel in.
 */
const WHEEL_STEP = 0.0015

/**
 * A point of the canvas of a fixed view, and the size of the canvas.
 */
export interface FixedViewPixel {
  /**
   * The distance from the left edge, in CSS pixels.
   */
  readonly x: number
  /**
   * The distance from the top edge, in CSS pixels.
   */
  readonly y: number
  /**
   * The width of the canvas, in CSS pixels.
   */
  readonly width: number
  /**
   * The height of the canvas, in CSS pixels.
   */
  readonly height: number
}

/**
 * What the pointer of a fixed view reads.
 */
export interface FixedViewPointerContext {
  /**
   * The scene of the view, when it is built: the plane of the walkable camera comes from it.
   *
   * @returns The scene, or `undefined` before the widget made it.
   */
  readonly view: () => ViewScene<OrthographicCamera> | undefined
  /**
   * The scene position of the level: the origin of the coordinates of its mesh.
   *
   * @returns The position, or `undefined` while there is no level.
   */
  readonly scenePosition: () => ArxVector3 | undefined
  /**
   * The direction the widget shows the level from.
   *
   * @returns The direction of the widget.
   */
  readonly mode: () => CameraViewMode
  /**
   * The zoom of the view: 1 frames the whole level.
   */
  readonly zoom: Ref<number>
  /**
   * Frames the view again, after the zoom changed.
   */
  readonly frameView: () => void
  /**
   * Reads the room of the face under a point of the canvas.
   *
   * @param pixel The point of the canvas, in CSS pixels.
   *
   * @returns The room of the face, or `undefined` when the ray hits nothing or the face has no room.
   */
  readonly roomAt: (pixel: FixedViewPixel) => number | undefined
  /**
   * Lights a room of the map while the pointer is on it, or clears the highlight.
   *
   * @param room The room under the pointer, or `undefined` when the highlight goes away.
   */
  readonly hoverRoom: (room: number | undefined) => void
  /**
   * Adds the faces of a room to the selection, or takes them away.
   *
   * @param room The room the `Shift` or the `Ctrl` click landed on.
   * @param mode Whether the room is added or taken away.
   */
  readonly selectRoom: (room: number, mode: SelectionMode) => void
  /**
   * Whether the room map is on: the `Shift` gestures of the pointer belong to it.
   *
   * @returns True while the map paints the rooms.
   */
  readonly isRoomMapVisible: () => boolean
}

/**
 * The handlers of the pointer of a fixed view.
 */
export interface FixedViewPointer {
  /**
   * Starts the pointer on the view: a press jumps, and a drag follows the pointer.
   *
   * @remarks
   * A `Shift` press on a room of the map does not move the camera: it adds the faces of the room to the selection, the
   * same gesture the room list has.
   *
   * @param event The pointer event of the view.
   */
  readonly onPointerDown: (event: PointerEvent) => void
  /**
   * Reads the point the pointer enters the view on.
   *
   * @param event The pointer event of the view.
   */
  readonly onPointerEnter: (event: PointerEvent) => void
  /**
   * Follows a dragged pointer.
   *
   * @remarks
   * A `Shift` pointer over the map lights the room it is on, and a plain pointer takes the highlight away.
   *
   * @param event The pointer event of the view.
   */
  readonly onPointerMove: (event: PointerEvent) => void
  /**
   * Ends the drag of the pointer.
   *
   * @param event The pointer event of the view.
   */
  readonly onPointerUp: (event: PointerEvent) => void
  /**
   * Takes the hover highlight away when the pointer leaves the canvas.
   */
  readonly onPointerLeave: () => void
  /**
   * Lights the room under the standing pointer again, or clears the highlight.
   *
   * @remarks
   * The widget calls it when the room map comes on: a pointer that stood still while the map was off has a hover to
   * read, and the next pointer move would be the only thing to show it otherwise.
   */
  readonly refreshHover: () => void
  /**
   * Starts the key listeners that keep the hover in step with `Shift`.
   */
  readonly start: () => void
  /**
   * Stops the key listeners.
   */
  readonly stop: () => void
  /**
   * Zooms the view with the wheel of the pointer.
   *
   * @param event The wheel event of the pointer.
   */
  readonly onWheel: (event: WheelEvent) => void
}

/**
 * Builds the pointer of a fixed view: the jump and the drag of the walkable camera, and the wheel of the zoom.
 *
 * @remarks
 * The framed (`1×`) view is a map of the whole level: the pointer is read on the plane of the walkable camera, and only
 * the two axes the view shows change — the marker lands under the pointer and the height (or the distance from the
 * level) stays. A drag uses the same mapping, so it follows the pointer; a zoomed view only jumps on a press, because
 * every move of the camera reframes it and the level would slide under the pointer.
 *
 * @param context What the pointer reads from the widget.
 *
 * @returns The handlers the widget binds.
 */
export function useFixedViewPointer(context: FixedViewPointerContext): FixedViewPointer {
  const { view, scenePosition, mode, zoom, frameView, roomAt, hoverRoom, selectRoom, isRoomMapVisible } = context

  /**
   * Whether the pointer is down on the view.
   */
  let pressing = false

  /**
   * Whether the pointer is over the canvas.
   */
  let inside = false

  /**
   * Whether `Shift` is held down, as the last pointer or key event reported it.
   */
  let shiftHeld = false

  /**
   * The last point of the canvas the pointer was on: the room of a `Shift` press comes from it.
   */
  let lastPixel: FixedViewPixel | undefined

  /**
   * Reads the pointer and the canvas it is on.
   *
   * @param event The pointer event of the view.
   *
   * @returns The pointer from the top left corner, and the size of the canvas, in CSS pixels.
   */
  function canvasOf(event: PointerEvent): FixedViewPixel {
    const stage = event.currentTarget as HTMLCanvasElement
    const box = stage.getBoundingClientRect()

    return { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height }
  }

  /**
   * Reads the pointer in the pixels of the canvas.
   *
   * @param event The pointer event of the view.
   *
   * @returns The distance of the pointer from the top left corner of the canvas, in CSS pixels.
   */
  function canvasPixel(event: PointerEvent): { x: number; y: number } {
    const { x, y } = canvasOf(event)

    return { x, y }
  }

  /**
   * Lights the room under the pointer, or clears the highlight.
   *
   * @remarks
   * It reads the last point the pointer was on, so a `Shift` press or release over a standing pointer updates the map
   * without a move: the view does not have to wait for the next `pointermove`.
   */
  function refreshHover(): void {
    if (pressing || !inside || lastPixel === undefined) {
      return
    }

    if (shiftHeld && isRoomMapVisible()) {
      hoverRoom(roomAt(lastPixel))

      return
    }

    hoverRoom(undefined)
  }

  /**
   * Follows the `Shift` key of the window, so a pointer that stands still reacts to the key too.
   *
   * @param event The key event of the window.
   */
  function onShiftKey(event: KeyboardEvent): void {
    if (event.key !== 'Shift') {
      return
    }

    shiftHeld = event.shiftKey
    refreshHover()
  }

  /**
   * Moves the walkable camera to the place under the pointer, with the angle it has now.
   *
   * @param event The pointer event of the view.
   */
  function moveToPointer(event: PointerEvent): void {
    const target = view()
    const pose = cameraStore.pose.value
    const origin = scenePosition()

    // without a 3D view there is nothing to move, and the store would drop the pose anyway
    if (target === undefined || pose === undefined || origin === undefined || !cameraStore.hasView.value) {
      return
    }

    const box = target.renderer.domElement.getBoundingClientRect()
    const pixel = canvasPixel(event)
    const place = planePointAt(
      { x: pixel.x, y: pixel.y, width: box.width, height: box.height },
      target.camera,
      gamePositionToWorld(pose.position, origin),
    )

    if (place === undefined) {
      return
    }

    cameraStore.moveCamera({
      position: targetPositionOf(mode(), worldPositionToGame(place, origin), pose.position),
      angle: pose.angle,
    })
  }

  return {
    onPointerDown: (event): void => {
      shiftHeld = event.shiftKey

      // Shift and Ctrl/Meta belong to the room map: they add or take the room under the pointer, and the camera stays
      const gesture = selectionModeOf(event)

      if (gesture !== 'replace' && isRoomMapVisible()) {
        const room = roomAt(canvasOf(event))

        if (room !== undefined) {
          selectRoom(room, gesture)
        }

        return
      }

      pressing = true
      inside = true
      lastPixel = canvasOf(event)
      hoverRoom(undefined)
      moveToPointer(event)

      const stage = event.currentTarget as HTMLElement
      stage.setPointerCapture(event.pointerId)
    },
    onPointerEnter: (event): void => {
      inside = true
      shiftHeld = event.shiftKey
      lastPixel = canvasOf(event)
      refreshHover()
    },
    onPointerMove: (event): void => {
      inside = true
      shiftHeld = event.shiftKey
      lastPixel = canvasOf(event)

      if (!pressing) {
        refreshHover()
      }

      if (!pressing || zoom.value > 1) {
        return
      }

      moveToPointer(event)
    },
    onPointerUp: (event): void => {
      pressing = false

      const stage = event.currentTarget as HTMLElement

      if (stage.hasPointerCapture(event.pointerId)) {
        stage.releasePointerCapture(event.pointerId)
      }
    },
    onPointerLeave: (): void => {
      inside = false
      hoverRoom(undefined)
    },
    refreshHover,
    start: (): void => {
      globalThis.addEventListener('keydown', onShiftKey)
      globalThis.addEventListener('keyup', onShiftKey)
    },
    stop: (): void => {
      globalThis.removeEventListener('keydown', onShiftKey)
      globalThis.removeEventListener('keyup', onShiftKey)
    },
    onWheel: (event): void => {
      event.preventDefault()

      const next = zoom.value * Math.exp(-event.deltaY * WHEEL_STEP)

      zoom.value = Math.min(Math.max(next, 1), MAX_ZOOM)
      frameView()
    },
  }
}
