import type { ArxVector3 } from 'arx-convert/types'
import type { PerspectiveCamera, Vector3 } from 'three'
import { centreOfBounds, type CameraBounds } from '../cameraBounds.ts'
import { applyGameAngle, gamePositionToWorld, type CameraPose } from '../cameraPose.ts'
import { alignPose, frustumOf, type CameraViewMode } from './cameraAlign.ts'

/**
 * How far the camera sees, compared to the distance it stands from the level.
 *
 * @remarks
 * The fixed views stand far away (a level is a few thousand units wide), so the range of the camera has
 * to follow that distance, or the far plane would cut the level off.
 */
const FAR_FACTOR = 4

/**
 * The near plane as a share of the distance.
 */
const NEAR_DIVISOR = 1000

/**
 * The most a fixed view zooms in.
 *
 * @remarks
 * The zoom is a multiple of the framed distance: `1` is the whole level (the view as it is without any
 * wheel), and the camera walks in towards the marker from there.
 */
export const MAX_ZOOM = 20

/**
 * What a fixed view needs to know.
 */
export interface FixedViewOptions {
  /**
   * The direction the view looks from.
   */
  readonly mode: CameraViewMode
  /**
   * The box of the level, in the game's coordinates.
   */
  readonly bounds: CameraBounds
  /**
   * The scene position of the level, the origin of the game ⇄ three conversion.
   */
  readonly scene: ArxVector3
  /**
   * The vertical field of view of the camera, in degrees.
   */
  readonly fieldOfView: number
  /**
   * The aspect ratio of the canvas of the widget.
   */
  readonly aspect: number
  /**
   * How far the view is zoomed in; `1` (the default) is the whole level.
   */
  readonly zoom?: number
  /**
   * The point the camera looks at when it is zoomed in, in the space of the meshes: the marker of the
   * walkable camera. Left out, the view keeps the centre of the level.
   */
  readonly target?: Vector3
}

/**
 * Keeps the zoom in a sane range.
 *
 * @param zoom The zoom of the widget, or `undefined` for the framed view.
 *
 * @returns The zoom, between 1 and {@link MAX_ZOOM}.
 */
function clampZoom(zoom: number | undefined): number {
  if (zoom === undefined) {
    return 1
  }

  return Math.min(Math.max(zoom, 1), MAX_ZOOM)
}

/**
 * Puts a camera to a fixed direction of the level and sets its range.
 *
 * @remarks
 * This is the whole of a fixed view: there is no pointer lock and no walkable camera, the pose is always
 * the framed one of the direction, and the url's `position`/`rotation` never touch it.
 *
 * @param camera The camera of the widget.
 * @param options The direction, the box of the level and the size of the canvas.
 *
 * @returns The pose the camera was put to, in the game's coordinates.
 */
export function frameFixedView(camera: PerspectiveCamera, options: FixedViewOptions): CameraPose {
  const pose = alignPose(options.mode, options.bounds, frustumOf(options.fieldOfView, options.aspect))
  const centre = gamePositionToWorld(centreOfBounds(options.bounds), options.scene)
  const framed = gamePositionToWorld(pose.position, options.scene)
  const distance = framed.distanceTo(centre)
  const zoom = clampZoom(options.zoom)
  const target = options.target ?? centre

  if (zoom === 1 || distance === 0) {
    camera.position.copy(framed)
  } else {
    // the camera walks in along the line it already stands on, so it keeps looking the same way and the
    // target stays in the middle of the canvas
    const away = framed
      .clone()
      .sub(centre)
      .normalize()
      .multiplyScalar(distance / zoom)

    camera.position.copy(target.clone().add(away))
  }

  applyGameAngle(camera, pose.angle)

  const near = Math.max(camera.position.distanceTo(target) / NEAR_DIVISOR, 0.1)

  // the far plane follows the framed distance, not the zoomed one: the level behind the marker has to stay
  // inside the view when the camera walks in
  camera.near = near
  camera.far = Math.max(distance, near) * FAR_FACTOR
  camera.updateProjectionMatrix()

  return pose
}
