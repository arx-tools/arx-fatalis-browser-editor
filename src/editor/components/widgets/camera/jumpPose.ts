import type { ArxVector3 } from 'arx-convert/types'
import type { CameraPose } from './cameraPose.ts'

/**
 * The pose of a camera that looks at a place from a distance, keeping the angles it has.
 *
 * @remarks
 * The camera turns on the spot of its view, so a jump moves it back along the forward it looks at: it stays in front of
 * the place it goes to, with the orientation of the author. The forward of the game's camera is `x` to the left, `y`
 * down and `z` out of the screen, and the angles are the degrees of the pose.
 *
 * @param pose The pose the camera has: the angles stay, and the eye moves back along the forward.
 * @param target The place to look at, in the game's coordinates.
 * @param distance How far the camera stands from it.
 *
 * @returns The pose the camera stands at after the jump.
 */
export function jumpPoseOf(pose: CameraPose, target: ArxVector3, distance: number): CameraPose {
  const pitch = (pose.angle.pitch * Math.PI) / 180
  const yaw = (pose.angle.yaw * Math.PI) / 180

  const forwardX = -Math.cos(pitch) * Math.sin(yaw)
  const forwardY = Math.sin(pitch)
  const forwardZ = Math.cos(pitch) * Math.cos(yaw)
  const backX = forwardX * distance
  const backY = forwardY * distance
  const backZ = forwardZ * distance

  return {
    position: { x: target.x - backX, y: target.y - backY, z: target.z - backZ },
    angle: pose.angle,
  }
}

/**
 * How far a camera stands from a thing of a radius, so the whole thing is in the view.
 *
 * @remarks
 * A small group is looked at from close, a big one from further: the distance follows the radius (the factor is about
 * the angle of the camera of the view), and the bounds keep a tiny thing readable and a huge one in front of the camera
 * without leaving the level.
 */
export const JUMP_DISTANCE_FACTOR = 2.5
export const JUMP_DISTANCE_MINIMUM = 300
export const JUMP_DISTANCE_MAXIMUM = 4000

/**
 * The distance of a jump for a thing of a radius.
 *
 * @param radius The radius of the thing, in the units of the level.
 *
 * @returns The distance, kept between {@link JUMP_DISTANCE_MINIMUM} and {@link JUMP_DISTANCE_MAXIMUM}.
 */
export function jumpDistanceOf(radius: number): number {
  const wanted = Math.max(0, radius) * JUMP_DISTANCE_FACTOR

  return Math.min(JUMP_DISTANCE_MAXIMUM, Math.max(JUMP_DISTANCE_MINIMUM, wanted))
}
