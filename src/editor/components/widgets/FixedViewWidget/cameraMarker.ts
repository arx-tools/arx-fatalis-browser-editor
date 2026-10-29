import type { ArxVector3 } from 'arx-convert/types'
import { PerspectiveCamera, Vector3 } from 'three'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { applyGameAngle, gamePositionToWorld, type CameraPose, type GameAngle } from '../cameraPose.ts'
import type { CameraViewMode } from './cameraAlign.ts'

/**
 * How long the direction line of the marker is, as a share of the distance of the camera from the marker.
 *
 * @remarks
 * A share of the distance keeps the line about the same length on the screen at every zoom: a world length
 * would shrink in the far views and blow up in the close ones.
 */
const ARROW_SHARE = 0.05

/**
 * The shortest direction line worth drawing, in CSS pixels.
 *
 * @remarks
 * When the camera looks along the direction of the fixed view itself, the line projects onto a point:
 * there is no angle to draw, so the arrow is left out.
 */
const MIN_ARROW_PIXELS = 1

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
   * Tells whether the point is in front of the camera and inside the frame.
   */
  readonly visible: boolean
}

/**
 * What a fixed view needs to place the marker of the camera.
 */
export interface MarkerInput {
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
  readonly camera: PerspectiveCamera
  /**
   * The width of the canvas in CSS pixels.
   */
  readonly width: number
  /**
   * The height of the canvas in CSS pixels.
   */
  readonly height: number
  /**
   * The direction of the view: the plan views follow the yaw, the side views take the other two axes.
   */
  readonly mode: CameraViewMode
}

/**
 * Everything the marker on the canvas of a fixed view needs.
 */
export interface MarkerState extends MarkerPlacement {
  /**
   * The angle of the direction line on the canvas, in degrees: `0` points up, `90` to the right.
   */
  readonly degrees: number
  /**
   * Tells whether there is a direction to draw (see {@link MIN_ARROW_PIXELS}).
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
 * @returns The position on the canvas, in CSS pixels, and whether it is visible.
 */
export function projectMarker(
  point: Vector3,
  camera: PerspectiveCamera,
  width: number,
  height: number,
): MarkerPlacement {
  // the projection reads the matrices of the camera, and the frame may have been set just now
  camera.updateMatrixWorld()

  const projected = point.clone().project(camera)
  const visible = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1

  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
    visible,
  }
}

/**
 * The direction of the marker in a side view, on the canvas.
 *
 * @remarks
 * A side view looks along one of the level's horizontal axes, so the direction the camera looks at has a
 * depth part the canvas can not show, and projecting it would flip the arrow as the yaw crosses the axis of
 * the view. The side views therefore take the **other two axes** of the camera: its right for the
 * horizontal part, its up for the vertical one, both measured on the axes of the view's own camera. The
 * arrow stays around the up of the canvas (a steep tilt at most), and it turns left and right as the camera
 * does — without flipping.
 *
 * @param pose The pose of the camera of the walkable view.
 * @param camera The camera of the fixed view: the axes of the canvas.
 *
 * @returns The direction on the canvas, in the units of the screen (`x` right, `y` up).
 */
function sideDirection(pose: CameraPose, camera: PerspectiveCamera): { x: number; y: number } {
  const walk = new PerspectiveCamera()

  applyGameAngle(walk, pose.angle)
  walk.updateMatrixWorld()
  camera.updateMatrixWorld()

  const right = new Vector3().setFromMatrixColumn(walk.matrixWorld, 0)
  const up = new Vector3().setFromMatrixColumn(walk.matrixWorld, 1)
  const rightOfView = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  const upOfView = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1)

  return { x: right.dot(rightOfView), y: up.dot(upOfView) }
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
 * Places the marker of the camera on the canvas of a fixed view: the dot of the pose and the angle of the
 * direction line.
 *
 * @remarks
 * - the dot follows the camera of the walkable view (see {@link markerPoint})
 * - the **plan** views show where the camera looks: the direction is projected from the dot, and its length
 * on the screen follows the distance, so a direction that points away from the fixed view collapses and the
 * arrow is left out
 * - the **side** views take the other two axes of the camera instead (see {@link sideDirection}), so their
 * arrow never flips
 *
 * @param input The pose, the level and the camera of the fixed view.
 *
 * @returns The position of the dot and the angle of the line.
 */
export function markerState(input: MarkerInput): MarkerState {
  const point = markerPoint(input.pose, input.player, input.scene)
  const placement = projectMarker(point, input.camera, input.width, input.height)

  if (input.pose === undefined) {
    return { ...placement, degrees: 0, arrow: false }
  }

  if (!isPlanView(input.mode)) {
    const side = sideDirection(input.pose, input.camera)
    const turned = (Math.atan2(side.x, side.y) * 180) / Math.PI

    return { ...placement, degrees: (turned + 360) % 360, arrow: true }
  }

  const distance = input.camera.position.distanceTo(point)
  const head = point.clone().add(viewDirection(input.pose.angle).multiplyScalar(distance * ARROW_SHARE))
  const projectedHead = projectMarker(head, input.camera, input.width, input.height)
  const dx = projectedHead.x - placement.x
  const dy = projectedHead.y - placement.y

  if (Math.hypot(dx, dy) < MIN_ARROW_PIXELS) {
    return { ...placement, degrees: 0, arrow: false }
  }

  // 0 degrees points up, and the canvas turns clockwise, so the screen delta is turned by atan2(x, -y)
  const turned = (Math.atan2(dx, -dy) * 180) / Math.PI
  const degrees = (turned + 360) % 360

  return { ...placement, degrees, arrow: true }
}
