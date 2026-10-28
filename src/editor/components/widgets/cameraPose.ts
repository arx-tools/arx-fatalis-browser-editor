import type { ArxVector3 } from 'arx-convert/types'
import { Euler, MathUtils, Vector3, type PerspectiveCamera } from 'three'

/**
 * The game's camera pitch, in degrees.
 */
export interface GameAngle {
  /**
   * The pitch: `-90` looks up, `90` looks down.
   */
  readonly pitch: number
  /**
   * The yaw: `0` to `360`, turning around the vertical axis.
   */
  readonly yaw: number
}

/**
 * Where the camera stands and where it looks, in the game's coordinate system.
 *
 * @remarks
 * This is the form the url, the camera controls widget and the fixed views all speak: both halves are in
 * the game's terms, so the conversion to the three.js space only happens at the camera itself.
 */
export interface CameraPose {
  /**
   * The eye of the camera.
   */
  readonly position: ArxVector3
  /**
   * Where the camera looks to.
   */
  readonly angle: GameAngle
}

/**
 * The euler the camera reads its angles with, kept outside so the getter does not allocate.
 */
const cameraEuler = new Euler(0, 0, 0, 'YXZ')

/**
 * Converts a position of the game's coordinate system into the three.js space.
 *
 * @remarks
 * The mesh of the level is built as `M(v - scenePosition)` where `M(x, y, z) = (-x, -y, z)`, so the
 * camera has to use the same transform to stand in the same place.
 *
 * @param position The point in the game's coordinate system.
 * @param scene The scene position of the level (`fts.header.mScenePosition`).
 *
 * @returns The point in the three.js space.
 */
export function gamePositionToWorld(position: ArxVector3, scene: ArxVector3): Vector3 {
  return new Vector3(scene.x - position.x, scene.y - position.y, position.z - scene.z)
}

/**
 * Converts a position of the three.js space back into the game's coordinate system.
 *
 * @param world The point in the three.js space.
 * @param scene The scene position of the level (`fts.header.mScenePosition`).
 *
 * @returns The point in the game's coordinate system.
 */
export function worldPositionToGame(world: Vector3, scene: ArxVector3): ArxVector3 {
  return { x: scene.x - world.x, y: scene.y - world.y, z: scene.z + world.z }
}

/**
 * Turns the camera to a game angle.
 *
 * @remarks
 * The camera is flipped by 180 degrees on the vertical axis, because the game's forward is `+Z` and
 * three.js looks towards `-Z`; the pitch is negated for the same reason (a positive game pitch looks
 * down). The roll is not wired in: the editor's camera has no roll.
 *
 * @param camera The camera to turn.
 * @param angle The angle to set.
 */
export function applyGameAngle(camera: PerspectiveCamera, angle: GameAngle): void {
  camera.rotation.set(MathUtils.degToRad(-angle.pitch), MathUtils.degToRad(angle.yaw - 180), 0, 'YXZ')
}

/**
 * Reads the angle of the camera in the game's terms.
 *
 * @param camera The camera to read.
 *
 * @returns The pitch and the yaw of the camera.
 */
export function readGameAngle(camera: PerspectiveCamera): GameAngle {
  cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ')

  return {
    yaw: (MathUtils.radToDeg(cameraEuler.y) + 180 + 360) % 360,
    pitch: -MathUtils.radToDeg(cameraEuler.x),
  }
}

/**
 * Tells whether a game angle is something the camera can apply.
 *
 * @remarks
 * The url is a text a user can edit, so a broken angle must not move the camera: the yaw has to be a
 * full turn and the pitch has to stay between the poles.
 *
 * @param angle The angle to check.
 *
 * @returns True when the camera can be set to it.
 */
export function isGameAngleInRange(angle: GameAngle): boolean {
  return angle.yaw >= 0 && angle.yaw < 360 && angle.pitch >= -90 && angle.pitch <= 90
}

/**
 * Reads where the camera stands and looks, in the game's coordinates.
 *
 * @param camera The camera to read.
 * @param scene The scene position of the level (`fts.header.mScenePosition`).
 *
 * @returns The eye and the facing of the camera, in the game's terms.
 */
export function readCameraPose(camera: PerspectiveCamera, scene: ArxVector3): CameraPose {
  return {
    position: worldPositionToGame(camera.position, scene),
    angle: readGameAngle(camera),
  }
}

/**
 * Puts the camera to a pose of the game's coordinate system.
 *
 * @param camera The camera to move.
 * @param scene The scene position of the level (`fts.header.mScenePosition`).
 * @param pose The pose to set.
 */
export function setCameraPose(camera: PerspectiveCamera, scene: ArxVector3, pose: CameraPose): void {
  camera.position.copy(gamePositionToWorld(pose.position, scene))
  applyGameAngle(camera, pose.angle)
}
