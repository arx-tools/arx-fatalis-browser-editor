import type { ArxVector3 } from 'arx-convert/types'
import type { PerspectiveCamera } from 'three'
import { alignPose, centreOfBounds, frustumOf, type CameraBounds, type CameraViewMode } from './cameraAlign.ts'
import { gamePositionToWorld, setCameraPose, type CameraPose } from './cameraPose.ts'

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

  setCameraPose(camera, options.scene, pose)

  const centre = gamePositionToWorld(centreOfBounds(options.bounds), options.scene)
  const distance = camera.position.distanceTo(centre)

  camera.near = Math.max(distance / NEAR_DIVISOR, 0.1)
  camera.far = distance * FAR_FACTOR
  camera.updateProjectionMatrix()

  return pose
}
