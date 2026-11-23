import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { usedVerticesOf } from '../../../generator/polygons.ts'
import type { CameraPose, GameAngle } from '../../components/widgets/camera/cameraPose.ts'

/**
 * How many radii of a face the camera stands away from it.
 */
const DISTANCE_FACTOR = 3

/**
 * The closest the camera gets to a face, in the units of the level.
 *
 * @remarks
 * A face of a level is tens of units wide and the player of the game is about sixty high, so this is about the
 * distance the player's eyes keep. A sliver of a curve would put the camera into the wall next to it with the factor
 * alone.
 */
const MINIMUM_DISTANCE = 60

/**
 * Turns the `-0` of a trigonometric result into a plain zero.
 *
 * @remarks
 * `atan2` of a zero x, and an `asin` of a zero y, give a negative zero, which is a different value for a comparison
 * (and for a test) though it reads as zero.
 *
 * @param value The number to clean.
 *
 * @returns The same number, with the negative zero turned into a zero.
 */
function plainZeroOf(value: number): number {
  if (value === 0) {
    return 0
  }

  return value
}

/**
 * The game angle that looks along a direction.
 *
 * @remarks
 * The game's angle and a direction are two faces of one thing; the six fixed views of `cameraAlign.ts` are its table:
 * yaw `0` looks along `+Z`, `90` along `-X`, `180` along `-Z` and `270` along `+X`, and pitch `90` looks down (the
 * game's Y points down) while `-90` looks up.
 *
 * @param direction The direction to look along, in the game's coordinates.
 *
 * @returns The angle of a camera looking along it, or the zero angle for a direction of no length.
 */
export function gameAngleOf(direction: ArxVector3): GameAngle {
  // the zeros are cleaned before the angles: a `-0` on the vertical axis would turn the yaw of a straight look into a
  // half turn, which is the screen's up turned upside down
  const x = plainZeroOf(direction.x)
  const y = plainZeroOf(direction.y)
  const z = plainZeroOf(direction.z)
  const length = Math.hypot(x, y, z)

  if (length === 0) {
    return { pitch: 0, yaw: 0 }
  }

  const pitch = (Math.asin(y / length) * 180) / Math.PI
  let yaw = (Math.atan2(-x, z) * 180) / Math.PI

  yaw = yaw % 360

  if (yaw < 0) {
    yaw = yaw + 360
  }

  return { pitch: plainZeroOf(pitch), yaw: plainZeroOf(yaw) }
}

/**
 * Where a face is and how it is looked at.
 */
export type FaceFrame = {
  /**
   * The middle of the face, in the game's coordinates.
   */
  readonly center: ArxVector3
  /**
   * How far the farthest corner of the face sits from its middle.
   */
  readonly radius: number
  /**
   * The pose of a camera that stands in front of the face and looks at it.
   */
  readonly pose: CameraPose
}

/**
 * Builds the frame of a face: the camera in front of it, looking at its middle.
 *
 * @remarks
 * The eye goes along the **normal** of the face, which is the side it shows: a wall is looked at from the room and
 * not from the inside of the wall. That is what makes a frame a way to find a face the view does not show (2026-11-22,
 * the four faces without a room of the owner's level 1). A face with no normal, or with no corner, has no frame.
 *
 * @param polygon The face to frame.
 *
 * @returns Its frame, or `undefined` when it has no usable normal.
 */
export function faceFrameOf(polygon: ArxPolygon): FaceFrame | undefined {
  const vertices = usedVerticesOf(polygon)

  if (vertices.length === 0) {
    return undefined
  }

  const { x: nx, y: ny, z: nz } = polygon.norm
  const normalLength = Math.hypot(nx, ny, nz)

  if (normalLength === 0) {
    return undefined
  }

  const normal = { x: nx / normalLength, y: ny / normalLength, z: nz / normalLength }
  const sum = { x: 0, y: 0, z: 0 }

  for (const vertex of vertices) {
    sum.x = sum.x + vertex.x
    sum.y = sum.y + vertex.y
    sum.z = sum.z + vertex.z
  }

  const center = { x: sum.x / vertices.length, y: sum.y / vertices.length, z: sum.z / vertices.length }
  let radius = 0

  for (const vertex of vertices) {
    radius = Math.max(radius, Math.hypot(vertex.x - center.x, vertex.y - center.y, vertex.z - center.z))
  }

  const distance = Math.max(radius * DISTANCE_FACTOR, MINIMUM_DISTANCE)
  const offset = { x: normal.x * distance, y: normal.y * distance, z: normal.z * distance }
  const position = { x: center.x + offset.x, y: center.y + offset.y, z: center.z + offset.z }

  return {
    center,
    radius,
    pose: { position, angle: gameAngleOf({ x: -normal.x, y: -normal.y, z: -normal.z }) },
  }
}
