import type { ArxVector3 } from 'arx-convert/types'
import { PerspectiveCamera, Vector3, type Camera } from 'three'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { applyGameAngle, gamePositionToWorld, type CameraPose, type GameAngle } from '../cameraPose.ts'
import type { CameraViewMode } from './cameraAlign.ts'

/**
 * The smallest part of the view direction that has to lie on the canvas for the arrow.
 *
 * @remarks
 * The direction is a unit vector, and the canvas shows two of its parts: a camera that looks straight into
 * the view (along its axis) has almost nothing on the canvas, and the turn of the arrow is not defined
 * there. Such a frame leaves the arrow out. The value is the length of the canvas part (`1` is a camera
 * looking across the view, `0` straight into it), so a look within about three degrees of the axis is below
 * it.
 */
const MIN_ARROW_SHARE = 0.05

/**
 * The distance the marker keeps from the edge of the canvas, in CSS pixels.
 *
 * @remarks
 * The arrowhead is 11 pixels wide and 16 tall, and it is drawn around its middle: an inset keeps the whole
 * shape on the canvas when the marker is pulled to the edge.
 */
const MARKER_INSET = 10

/**
 * Where the camera marker of a fixed view goes on the canvas.
 */
export interface MarkerPlacement {
  /**
   * The left position in CSS pixels.
   */
  readonly x: number
  /**
   * The top position in CSS pixels.
   */
  readonly y: number
  /**
   * Tells whether the point is outside the frame, so the marker was pulled to the edge of the canvas.
   */
  readonly clamped: boolean
}

/**
 * What a fixed view needs to place the marker of the camera.
 */
export interface MarkerInput {
  /**
   * The direction of the view: the plan views show the heading, the side ones the attitude of the camera.
   */
  readonly mode: CameraViewMode
  /**
   * The pose of the camera of the walkable view, or `undefined` when no view reported one yet.
   */
  readonly pose: CameraPose | undefined
  /**
   * The player of the level, the spawn the marker falls back to.
   */
  readonly player: ArxVector3
  /**
   * The scene position of the level.
   */
  readonly scene: ArxVector3
  /**
   * The camera of the fixed view: the projection follows its framing.
   */
  readonly camera: Camera
  /**
   * The width of the canvas in CSS pixels.
   */
  readonly width: number
  /**
   * The height of the canvas in CSS pixels.
   */
  readonly height: number
}

/**
 * Everything the marker on the canvas of a fixed view needs.
 */
export interface MarkerState extends MarkerPlacement {
  /**
   * Tells whether there is a marker to draw at all.
   *
   * @remarks
   * It is `false` only while there is no pose and no level to stand on: a marker that is outside the frame
   * is still drawn, on the edge of the canvas.
   */
  readonly visible: boolean
  /**
   * The angle of the direction line on the canvas, in degrees: `0` points up, `90` to the right.
   */
  readonly degrees: number
  /**
   * Tells whether there is a direction to draw (see {@link MIN_ARROW_SHARE}).
   */
  readonly arrow: boolean
}

/**
 * Where the camera stands, in the space of the meshes.
 *
 * @remarks
 * - the marker follows the **camera**: the store keeps its pose in the game's coordinates, and
 * `gamePositionToWorld` is the same conversion the walkable view uses, so the dot is exactly where the
 * camera is
 * - before a view reports a pose (a layout without a 3D view) the level's own spawn stands in: the
 * player's position is **relative to the scene position**, so it is already in the space of the meshes
 * (`arxVector3toVector3`, no offset) — the same point the spawn puts the camera to
 *
 * @param pose The pose of the camera, or `undefined` when no view reported one yet.
 * @param player The player of the level, the spawn of the level.
 * @param scene The scene position of the level.
 *
 * @returns The point in the three.js space of the meshes.
 */
export function markerPoint(pose: CameraPose | undefined, player: ArxVector3, scene: ArxVector3): Vector3 {
  if (pose === undefined) {
    return arxVector3toVector3(player)
  }

  return gamePositionToWorld(pose.position, scene)
}

/**
 * Projects a point of the mesh space onto the canvas of a fixed view.
 *
 * @remarks
 * The camera is the one of the fixed view, so the projection follows the framing of the direction: after a
 * resize or a level change the view is framed again, and the marker is projected again. The camera of the
 * fixed view never moves, so a marker that moves means the camera of the walkable view moved.
 *
 * @param point The point to project.
 * @param camera The camera of the view.
 * @param width The width of the canvas in CSS pixels.
 * @param height The height of the canvas in CSS pixels.
 *
 * The marker is **always on the canvas**: a fixed view is a window on the level, and the camera of the
 * walkable view can stand outside of it (a zoomed view shows the centre, not the camera). Such a marker is
 * pulled to the edge of the canvas, so the eye always finds it, and {@link MarkerPlacement.clamped} says
 * that it is out of the frame.
 *
 * @returns The position on the canvas, in CSS pixels, and whether it had to be pulled to the edge.
 */
export function projectMarker(point: Vector3, camera: Camera, width: number, height: number): MarkerPlacement {
  // the projection reads the matrices of the camera, and the frame may have been set just now
  camera.updateMatrixWorld()

  const projected = point.clone().project(camera)
  const inside = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1

  const x = ((projected.x + 1) / 2) * width
  const y = ((1 - projected.y) / 2) * height

  return {
    x: Math.min(Math.max(x, MARKER_INSET), Math.max(width - MARKER_INSET, MARKER_INSET)),
    y: Math.min(Math.max(y, MARKER_INSET), Math.max(height - MARKER_INSET, MARKER_INSET)),
    clamped: !inside,
  }
}

/**
 * The direction the camera of the pose looks at, in the space of the meshes.
 *
 * @remarks
 * It is the same turn `applyGameAngle` gives the walkable camera, so the line points where the camera looks
 * in the level.
 *
 * @param angle The game angle of the pose.
 *
 * @returns The unit vector of the view direction.
 */
function viewDirection(angle: GameAngle): Vector3 {
  const helper = new PerspectiveCamera()

  applyGameAngle(helper, angle)
  helper.updateMatrixWorld()

  return helper.getWorldDirection(new Vector3())
}

/**
 * Tells whether the view is a plan one: the top and the bottom look along the vertical axis.
 *
 * @param mode The direction of the view.
 *
 * @returns `true` for the top and the bottom views.
 */
function isPlanView(mode: CameraViewMode): boolean {
  return mode === 'top' || mode === 'bottom'
}

/**
 * The direction the camera of the pose looks at, on the canvas of a fixed view.
 *
 * @remarks
 * The direction of the walkable camera is projected onto the two axes of the canvas: `x` is the right of
 * the view, `y` its up, both unit vectors. So `(0, -1)` is a camera looking down the canvas, `(1, 0)` one
 * looking across it, and a **tilt** shows up in every view where the canvas has a vertical part: looking
 * down 31 degrees tilts the arrow down, and turning around swings it to the other side. This is the same
 * for the plan and the side views, which is why the marker needs no mode.
 *
 * @param pose The pose of the camera of the walkable view.
 * @param camera The camera of the fixed view: the axes of the canvas.
 *
 * @returns The direction on the canvas, in the units of the screen (`x` right, `y` up).
 */
function directionOnScreen(pose: CameraPose, camera: Camera): { x: number; y: number } {
  camera.updateMatrixWorld()

  const forward = viewDirection(pose.angle)
  const rightOfView = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const upOfView = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)

  return { x: forward.dot(rightOfView), y: forward.dot(upOfView) }
}

/**
 * Which way the arrow of a side view leans: `1` to the right of the canvas, `-1` to the left.
 *
 * @remarks
 * Two measures say it, and the stronger one wins: the part of the look that lies across the canvas (a camera
 * that looks across the view leans clearly), and the part of its right axis (a camera that looks into the
 * view leans with its right, which is the natural reading when the look itself has nothing across the
 * canvas — looking into a map tells no left from right, and the camera's own right does).
 *
 * @param pose The pose of the camera of the walkable view.
 * @param camera The camera of the fixed view: the axes of the canvas.
 *
 * @returns `1` or `-1`.
 */
function sideSwing(pose: CameraPose, camera: Camera): 1 | -1 {
  const walk = new PerspectiveCamera()

  applyGameAngle(walk, pose.angle)
  walk.updateMatrixWorld()
  camera.updateMatrixWorld()

  const forward = viewDirection(pose.angle)
  const right = new Vector3().setFromMatrixColumn(walk.matrixWorld, 0)
  const rightOfView = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)

  const across = forward.dot(rightOfView)
  const compass = right.dot(rightOfView)
  let stronger = compass

  if (Math.abs(across) > Math.abs(compass)) {
    stronger = across
  }

  if (stronger < 0) {
    return -1
  }

  return 1
}

/**
 * Places the marker of the camera on the canvas of a fixed view: the dot of the pose and the angle of the
 * direction line.
 *
 * @remarks
 * The dot follows the camera of the walkable view (see {@link markerPoint}), and the arrow shows where that
 * camera looks, projected onto the canvas (see {@link directionOnScreen}): the turn and the tilt both show
 * up, in every one of the six views.
 *
 * @param input The pose, the level and the camera of the fixed view.
 *
 * @returns The position of the dot and the angle of the line.
 */
export function markerState(input: MarkerInput): MarkerState {
  const point = markerPoint(input.pose, input.player, input.scene)
  const placement = projectMarker(point, input.camera, input.width, input.height)

  if (input.pose === undefined) {
    return { ...placement, visible: true, degrees: 0, arrow: false }
  }

  if (!isPlanView(input.mode)) {
    // a side view shows the attitude of the camera: the tilt of the arrow is the pitch, and the yaw only
    // picks the side it leans to. 0 degrees points up, 90 to the right, so a look down of `p` degrees puts
    // the arrow `p` below the horizontal of the side it leans to
    const { pitch } = input.pose.angle
    let swung = 270 - pitch

    if (sideSwing(input.pose, input.camera) > 0) {
      swung = 90 + pitch
    }

    return { ...placement, visible: true, degrees: (swung + 360) % 360, arrow: true }
  }

  // a plan view shows the heading: the pitch points along its axis of view, so the arrow is the part of the
  // look that lies on the canvas
  const direction = directionOnScreen(input.pose, input.camera)

  if (Math.hypot(direction.x, direction.y) < MIN_ARROW_SHARE) {
    return { ...placement, visible: true, degrees: 0, arrow: false }
  }

  // 0 degrees points up, and the canvas turns clockwise, so the screen direction is turned by atan2(x, y)
  const turned = (Math.atan2(direction.x, direction.y) * 180) / Math.PI

  return { ...placement, visible: true, degrees: (turned + 360) % 360, arrow: true }
}
