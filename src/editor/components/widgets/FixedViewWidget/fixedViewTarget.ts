import type { ArxVector3 } from 'arx-convert/types'
import { Vector3, type OrthographicCamera } from 'three'
import type { CameraViewMode } from './cameraAlign.ts'

/**
 * A pixel of the canvas of a fixed view, and the size of that canvas.
 */
export interface CanvasPoint {
  /**
   * The distance of the pixel from the left edge of the canvas.
   */
  readonly x: number
  /**
   * The distance of the pixel from the top edge of the canvas.
   */
  readonly y: number
  /**
   * The width of the canvas in pixels.
   */
  readonly width: number
  /**
   * The height of the canvas in pixels.
   */
  readonly height: number
}

/**
 * The offset of the pointer since a drag started, in CSS pixels.
 */
export interface PixelOffset {
  /**
   * How far the pointer moved to the right.
   */
  readonly x: number
  /**
   * How far the pointer moved down.
   */
  readonly y: number
}

/**
 * The game axis a fixed view looks along.
 *
 * @remarks
 * The camera of a fixed view stands on this axis, so the image shows the other two: a plan view looks down
 * the game's `y`, and an elevation along `z` (front, back) or `x` (left, right). The pick can not change
 * this one: the place under the pointer has a depth on it, and that depth is the view's, not the level's.
 */
export const DEPTH_AXIS_OF: Record<CameraViewMode, 'x' | 'y' | 'z'> = {
  top: 'y',
  bottom: 'y',
  front: 'z',
  back: 'z',
  left: 'x',
  right: 'x',
}

/**
 * Builds the position a click of a fixed view asks for.
 *
 * @remarks
 * Only the two axes the view shows come from the hit; the third one keeps the value the camera has now.
 * A plan view therefore moves the camera on the floor and leaves its height alone, and an elevation keeps
 * its distance from the level: the fixed view never pulls the camera towards itself or pushes it away.
 *
 * @param mode The direction of the view.
 * @param hit The place of the level under the pointer, in the game's coordinates.
 * @param current The position the walkable camera has now.
 *
 * @returns The position to move the camera to.
 */
export function targetPositionOf(mode: CameraViewMode, hit: ArxVector3, current: ArxVector3): ArxVector3 {
  const depth = DEPTH_AXIS_OF[mode]

  switch (depth) {
    case 'x': {
      return { x: current.x, y: hit.y, z: hit.z }
    }

    case 'y': {
      return { x: hit.x, y: current.y, z: hit.z }
    }

    case 'z': {
      return { x: hit.x, y: hit.y, z: current.z }
    }
  }
}

/**
 * How many world units one CSS pixel covers on the canvas of a fixed view.
 *
 * @remarks
 * The camera of a fixed view is **orthographic**, so a pixel is a square of the world at **every** depth:
 * the frame is (top - bottom) divided by the zoom of the camera, over the height of the canvas. This is the
 * scale the click and the drag use, which is why neither needs a ray, and why the marker of the camera
 * lands exactly under the pointer.
 *
 * @param camera The orthographic camera of the fixed view.
 * @param height The height of the canvas, in CSS pixels.
 *
 * @returns The size of one pixel in world units.
 */
export function worldUnitsPerPixel(camera: OrthographicCamera, height: number): number {
  const frameHeight = camera.top - camera.bottom
  const worldHeight = frameHeight / camera.zoom

  return worldHeight / height
}

/**
 * Moves a point of the level by a pixel offset of the canvas.
 *
 * @remarks
 * The camera is orthographic, so the offset of the pointer is a plain scale of the world at any depth: this
 * is what makes a drag follow the pointer exactly, instead of jumping between the surfaces a ray would meet
 * on the way. The camera keeps looking the same way, so its right and up stay the axes of the canvas, and
 * the vertical pixel offset is turned around (`up` grows to the top of the canvas).
 *
 * @param point The point of the level the drag started on, in the space of the meshes.
 * @param camera The camera of the fixed view.
 * @param pixels The offset of the pointer since the drag started, in CSS pixels.
 * @param height The height of the canvas, in CSS pixels.
 *
 * @returns The point under the pointer, at the depth of the start.
 */
export function offsetOnPlane(
  point: Vector3,
  camera: OrthographicCamera,
  pixels: PixelOffset,
  height: number,
): Vector3 {
  camera.updateMatrixWorld()

  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
  const scale = worldUnitsPerPixel(camera, height)

  return point
    .clone()
    .add(right.multiplyScalar(pixels.x * scale))
    .add(up.multiplyScalar(-pixels.y * scale))
}

/**
 * Reads the place of the level under a pixel of a fixed view, on the plane of the walkable camera.
 *
 * @remarks
 * The plane stands **perpendicular to the camera and goes through the walkable camera**, which is the only
 * plane that keeps the marker under the pointer: a pixel maps to one point of it, and that point projects
 * back to the same pixel. Picking the surface under the pointer instead would answer with the place of a
 * face that stands at another depth, and the marker would land somewhere else — the deeper the level, the
 * further off.
 *
 * The plane also makes a click of a fixed view **free of the level**: the black parts of the view (no
 * polygon there) move the camera just like the drawn ones, and the move is a plain scale of pixels, so a
 * drag follows the pointer without a ray for every move.
 *
 * @param pixel The pixel of the click and the size of the canvas.
 * @param camera The camera of the fixed view.
 * @param through The position of the walkable camera, in the space of the meshes: the plane goes through it.
 *
 * @returns The point on the plane, in the space of the meshes, or `undefined` when the plane is behind the
 * camera (the walkable camera is behind the fixed one, which only a deep zoom can do).
 */
export function planePointAt(pixel: CanvasPoint, camera: OrthographicCamera, through: Vector3): Vector3 | undefined {
  camera.updateMatrixWorld()

  const forward = camera.getWorldDirection(new Vector3())
  const distance = through.clone().sub(camera.position).dot(forward)

  if (distance <= camera.near) {
    return undefined
  }

  const centre = camera.position.clone().add(forward.multiplyScalar(distance))
  const halfWidth = pixel.width / 2
  const halfHeight = pixel.height / 2

  return offsetOnPlane(centre, camera, { x: pixel.x - halfWidth, y: pixel.y - halfHeight }, pixel.height)
}
