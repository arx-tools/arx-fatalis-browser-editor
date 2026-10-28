import type { ArxVector3 } from 'arx-convert/types'
import { Vector3 } from 'three'
import type { CameraPose, GameAngle } from './cameraPose.ts'

/**
 * The box the align buttons fit the view to, in the game's coordinate system.
 *
 * @remarks
 * The fixed views align to the **level**, so the box comes from the bounding box of the mesh. The archived
 * editor aligned to the anchor graph instead; the anchors are not ported yet, and the level is the next
 * best answer to "show me the whole thing".
 */
export interface CameraBounds {
  /**
   * The corner with the smallest coordinates.
   */
  readonly min: ArxVector3
  /**
   * The corner with the largest coordinates.
   */
  readonly max: ArxVector3
}

/**
 * The six fixed views of the align row.
 *
 * @remarks
 * The three horizontal ones come in pairs: `front`/`back` look along the Z axis of the game, `left`/`right`
 * along the X axis, and `top`/`bottom` along the Y, which points down.
 */
export type CameraViewMode = 'back' | 'bottom' | 'front' | 'left' | 'right' | 'top'

/**
 * How much of the frame the level may fill: the alignment keeps a border of the rest.
 *
 * @remarks
 * Without it a corner of the box lands exactly on the edge of the canvas, which reads as a cut-off view
 * even though it fits.
 */
const FRAMING_MARGIN = 0.9

/**
 * How far the camera goes at least, in the level's units.
 *
 * @remarks
 * A small level would put the camera inside its own geometry with a distance derived from the size, so
 * the archived editor never went closer than this. The value is kept, so the two editors do not differ
 * on a tiny test level.
 */
const MINIMUM_DISTANCE = 400

/**
 * The tangents of the half field of view of the view being framed.
 *
 * @remarks
 * Both come from the camera of the 3D widget, because only that knows the field of view and the aspect
 * ratio of the canvas. The alignment is a frustum fit: a corner of the level is inside the frame when
 * its distance from the view axis is smaller than its depth times the tangent of the half angle.
 */
export interface CameraFrustum {
  /**
   * The tangent of the half horizontal angle (`tan(fov / 2) * aspect`).
   */
  readonly tanHorizontal: number
  /**
   * The tangent of the half vertical angle (`tan(fov / 2)`).
   */
  readonly tanVertical: number
}

/**
 * Builds the frustum of a camera out of its field of view and the aspect ratio of its canvas.
 *
 * @param fieldOfView The vertical field of view in degrees.
 * @param aspect The aspect ratio of the canvas.
 *
 * @returns The tangents of the half field of view.
 */
export function frustumOf(fieldOfView: number, aspect: number): CameraFrustum {
  const tanVertical = Math.tan((fieldOfView * Math.PI) / 360)

  return { tanHorizontal: tanVertical * aspect, tanVertical }
}

/**
 * Reads the centre of a box.
 *
 * @param bounds The box to read.
 *
 * @returns The point in the middle of it, in the game's coordinates.
 */
export function centreOfBounds(bounds: CameraBounds): ArxVector3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
}

/**
 * One fixed view: where it looks along, which way is up on the screen, and the angle the camera gets.
 *
 * @remarks
 * The vectors are in the game's coordinate system. The classic heuristic (a distance from the centre)
 * cuts a wide level off at the near side, so the distance is computed from the corners instead.
 */
interface View {
  /**
   * The direction the camera looks along, in the game's coordinates.
   */
  readonly axis: ArxVector3
  /**
   * The direction that is up on the screen, in the game's coordinates.
   */
  readonly up: ArxVector3
  /**
   * The angle of the camera in the game's terms.
   */
  readonly angle: GameAngle
}

/**
 * The fixed views.
 *
 * @remarks
 * - the game's Y points down, so "above" a level is a smaller Y of the position, and the up of a
 * horizontal view is the negative Y (the game's ceiling is the smaller Y)
 * - the game mirrors X and Y on the way into the three.js space, which is why the yaw of a side view is
 * the opposite of the naive value: `left` looks along `+X` of the game, which is `-X` of three.js, so its
 * yaw is `270` and not `90` (TODO 59). `right`/`back` are the pairs of those, a half turn away
 * - `bottom` looks up, so its pitch is `-90` (the same mirroring: `-90` is an upward look)
 */
const VIEWS: Record<CameraViewMode, View> = {
  top: { axis: { x: 0, y: 1, z: 0 }, up: { x: 0, y: 0, z: 1 }, angle: { pitch: 90, yaw: 0 } },
  bottom: { axis: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: -1 }, angle: { pitch: -90, yaw: 0 } },
  front: { axis: { x: 0, y: 0, z: 1 }, up: { x: 0, y: -1, z: 0 }, angle: { pitch: 0, yaw: 0 } },
  back: { axis: { x: 0, y: 0, z: -1 }, up: { x: 0, y: -1, z: 0 }, angle: { pitch: 0, yaw: 180 } },
  left: { axis: { x: 1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 }, angle: { pitch: 0, yaw: 270 } },
  right: { axis: { x: -1, y: 0, z: 0 }, up: { x: 0, y: -1, z: 0 }, angle: { pitch: 0, yaw: 90 } },
}

/**
 * Reads the eight corners of a box.
 *
 * @param bounds The box to read.
 *
 * @returns The corners, in the game's coordinates.
 */
function cornersOf(bounds: CameraBounds): ArxVector3[] {
  const corners: ArxVector3[] = []

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push({ x, y, z })
      }
    }
  }

  return corners
}

/**
 * Builds the pose of a fixed view over the given box.
 *
 * @remarks
 * Every corner of the box is measured against the view axis: a corner needs the depth that keeps its
 * sideways and upward distances inside the frustum, and the camera goes as far back as the neediest
 * corner asks (plus {@link FRAMING_MARGIN} of a border). This is why a deep level is framed as well as
 * a flat one: the near corners count with their own, smaller depth.
 *
 * @param mode The view to build.
 * @param bounds The box to fit the view to, in the game's coordinates.
 * @param frustum The tangents of the half field of view of the view being framed.
 *
 * @returns The pose of the camera for that view.
 */
export function alignPose(mode: CameraViewMode, bounds: CameraBounds, frustum: CameraFrustum): CameraPose {
  const view = VIEWS[mode]
  const middle = centreOfBounds(bounds)
  const centre = new Vector3(middle.x, middle.y, middle.z)
  const axis = new Vector3(view.axis.x, view.axis.y, view.axis.z)
  const up = new Vector3(view.up.x, view.up.y, view.up.z)
  const right = new Vector3().crossVectors(axis, up)
  const tanHorizontal = frustum.tanHorizontal * FRAMING_MARGIN
  const tanVertical = frustum.tanVertical * FRAMING_MARGIN

  let distance = MINIMUM_DISTANCE

  for (const corner of cornersOf(bounds)) {
    const offset = new Vector3(corner.x - centre.x, corner.y - centre.y, corner.z - centre.z)
    const along = offset.dot(axis)
    const horizontal = Math.abs(offset.dot(right)) / tanHorizontal
    const vertical = Math.abs(offset.dot(up)) / tanVertical

    distance = Math.max(distance, horizontal - along, vertical - along)
  }

  const offset = axis.clone().multiplyScalar(distance)

  return {
    position: { x: centre.x - offset.x, y: centre.y - offset.y, z: centre.z - offset.z },
    angle: view.angle,
  }
}
