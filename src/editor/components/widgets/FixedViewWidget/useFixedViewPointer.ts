import type { ArxVector3 } from 'arx-convert/types'
import type { OrthographicCamera } from 'three'
import type { Ref } from 'vue'
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
}

/**
 * The handlers of the pointer of a fixed view.
 */
export interface FixedViewPointer {
  /**
   * Starts the pointer on the view: a press jumps, and a drag follows the pointer.
   *
   * @param event The pointer event of the view.
   */
  readonly onPointerDown: (event: PointerEvent) => void
  /**
   * Follows a dragged pointer.
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
  const { view, scenePosition, mode, zoom, frameView } = context

  /**
   * Whether the pointer is down on the view.
   */
  let pressing = false

  /**
   * Reads the pointer in the pixels of the canvas.
   *
   * @param event The pointer event of the view.
   *
   * @returns The distance of the pointer from the top left corner of the canvas, in CSS pixels.
   */
  function canvasPixel(event: PointerEvent): { x: number; y: number } {
    const stage = event.currentTarget as HTMLCanvasElement
    const box = stage.getBoundingClientRect()

    return { x: event.clientX - box.left, y: event.clientY - box.top }
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
      pressing = true
      moveToPointer(event)

      const stage = event.currentTarget as HTMLElement
      stage.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event): void => {
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
    onWheel: (event): void => {
      event.preventDefault()

      const next = zoom.value * Math.exp(-event.deltaY * WHEEL_STEP)

      zoom.value = Math.min(Math.max(next, 1), MAX_ZOOM)
      frameView()
    },
  }
}
