import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Euler, PerspectiveCamera, Vector3 } from 'three'
import {
  markerPoint,
  markerState,
  projectMarker,
} from '../../../../../src/editor/components/widgets/FixedViewWidget/cameraMarker.ts'
import { gamePositionToWorld } from '../../../../../src/editor/components/widgets/cameraPose.ts'

/**
 * A camera of the test: it stands on the +Z axis and looks at the origin.
 *
 * @param distance The distance from the origin.
 *
 * @returns The camera, with its matrices up to date.
 */
function cameraAt(distance: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(75, 1, 0.1, 1000)

  camera.position.set(0, 0, distance)
  camera.updateMatrixWorld()

  return camera
}

/**
 * The scene position of the test level.
 */
const scene: { x: number; y: number; z: number } = { x: 3000, y: 1000, z: 9000 }

/**
 * The player (spawn) of the test level, relative to the scene position.
 */
const player: { x: number; y: number; z: number } = { x: 100, y: 200, z: 300 }

void describe('markerPoint', () => {
  void it('follows the pose of the camera', () => {
    const pose = { position: { x: 3500, y: 1200, z: 9100 }, angle: { pitch: 0, yaw: 0 } }

    assert.deepEqual(markerPoint(pose, player, scene), gamePositionToWorld(pose.position, scene))
  })

  void it('stands on the spawn before a view reports a pose', () => {
    // the player's position is relative to the scene position: no offset comes in
    assert.deepEqual(markerPoint(undefined, player, scene), new Vector3(-100, -200, 300))
  })

  void it('keeps the sign of the z coordinate', () => {
    assert.equal(markerPoint({ position: { x: 0, y: 0, z: -50 }, angle: { pitch: 0, yaw: 0 } }, player, scene).z, -9050)
  })
})

void describe('projectMarker', () => {
  void it('puts a point in front of the camera in the middle', () => {
    const placement = projectMarker(new Vector3(0, 0, 0), cameraAt(10), 400, 200)

    assert.equal(placement.visible, true)
    assert.equal(Math.round(placement.x), 200)
    assert.equal(Math.round(placement.y), 100)
  })

  void it('puts a point above the middle higher on the canvas', () => {
    const placement = projectMarker(new Vector3(0, 5, 0), cameraAt(10), 400, 200)

    assert.equal(placement.visible, true)
    assert.ok(placement.y < 100)
  })

  void it('puts a point on the right of the camera on the right', () => {
    // the camera looks down -Z, so its +X is the right side of the screen
    const placement = projectMarker(new Vector3(5, 0, 0), cameraAt(10), 400, 200)

    assert.equal(placement.visible, true)
    assert.ok(placement.x > 200)
  })

  void it('hides a point behind the camera', () => {
    const placement = projectMarker(new Vector3(0, 0, 20), cameraAt(10), 400, 200)

    assert.equal(placement.visible, false)
  })

  void it('hides a point outside the frame', () => {
    const placement = projectMarker(new Vector3(500, 0, 0), cameraAt(10), 400, 200)

    assert.equal(placement.visible, false)
  })

  void it('follows the camera when it turns', () => {
    const camera = cameraAt(10)

    assert.equal(projectMarker(new Vector3(5, 0, 0), camera, 400, 200).visible, true)

    // turned away by 90 degrees: the same point is outside the frame now
    camera.quaternion.setFromEuler(new Euler(0, Math.PI / 2, 0))
    camera.updateMatrixWorld()

    assert.equal(projectMarker(new Vector3(5, 0, 0), camera, 400, 200).visible, false)
  })
})

/**
 * The pose of the test camera: it stands on the origin and looks with the given yaw.
 *
 * @param yaw The yaw of the game angle, in degrees.
 *
 * @returns The pose of the camera.
 */
function poseAt(yaw: number): { position: { x: number; y: number; z: number }; angle: { pitch: number; yaw: number } } {
  return { position: { x: 3000, y: 1000, z: 9000 }, angle: { pitch: 0, yaw } }
}

void describe('markerState', () => {
  void it('shows no arrow without a pose', () => {
    const state = markerState({
      pose: undefined,
      player,
      scene,
      camera: cameraAt(10),
      width: 400,
      height: 200,
    })

    // the spawn is out of this camera's frame, and it has no direction to draw either
    assert.equal(state.arrow, false)
  })

  void it('turns the arrow with the yaw of the camera', () => {
    // the game yaw 90 looks towards +X, which is the right side of a camera on the +Z axis
    const right = markerState({
      pose: poseAt(90),
      player,
      scene,
      camera: cameraAt(10),
      width: 400,
      height: 200,
    })

    assert.equal(right.arrow, true)
    assert.ok(Math.abs(right.degrees - 90) < 1)

    // the game yaw 270 looks towards -X, the left side
    const left = markerState({
      pose: poseAt(270),
      player,
      scene,
      camera: cameraAt(10),
      width: 400,
      height: 200,
    })

    assert.equal(left.arrow, true)
    assert.ok(Math.abs(left.degrees - 270) < 1)
  })

  void it('leaves the arrow out when the camera looks along the view', () => {
    // the game yaw 0 looks towards +Z, straight at the camera of this fixed view: the line collapses
    const state = markerState({
      pose: poseAt(0),
      player,
      scene,
      camera: cameraAt(10),
      width: 400,
      height: 200,
    })

    assert.equal(state.arrow, false)
  })

  void it('keeps the dot of the pose', () => {
    const state = markerState({
      pose: { position: { x: 3000, y: 1000, z: 9000 }, angle: { pitch: 0, yaw: 90 } },
      player,
      scene,
      camera: cameraAt(10),
      width: 400,
      height: 200,
    })

    assert.equal(Math.round(state.x), 200)
    assert.equal(Math.round(state.y), 100)
  })
})
