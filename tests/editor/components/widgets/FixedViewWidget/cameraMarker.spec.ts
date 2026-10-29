import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Euler, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three'
import {
  markerPoint,
  markerState,
  projectMarker,
  type MarkerInput,
} from '../../../../../src/editor/components/widgets/FixedViewWidget/cameraMarker.ts'
import {
  applyGameAngle,
  gamePositionToWorld,
  type CameraPose,
} from '../../../../../src/editor/components/widgets/cameraPose.ts'
import type { PixelOffset } from '../../../../../src/editor/components/widgets/FixedViewWidget/fixedViewTarget.ts'
import type { CameraViewMode } from '../../../../../src/editor/components/widgets/FixedViewWidget/cameraAlign.ts'

/**
 * A camera of the test: it stands on the +Z axis and looks at the origin.
 *
 * @param distance The distance from the origin.
 *
 * @returns The camera, with its matrices up to date.
 */
function cameraAt(distance: number): OrthographicCamera {
  // the fixed views are orthographic, and the canvas of the test is 400x200: the frame is 16 units wide
  // and 8 tall, so a point 5 units to the right is inside the frame
  const camera = new OrthographicCamera(-8, 8, 4, -4, 0.1, 1000)

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

    assert.equal(placement.clamped, false)
    assert.equal(Math.round(placement.x), 200)
    assert.equal(Math.round(placement.y), 100)
  })

  void it('puts a point above the middle higher on the canvas', () => {
    const placement = projectMarker(new Vector3(0, 2, 0), cameraAt(10), 400, 200)

    assert.equal(placement.clamped, false)
    assert.ok(placement.y < 100)
  })

  void it('puts a point on the right of the camera on the right', () => {
    // the camera looks down -Z, so its +X is the right side of the screen
    const placement = projectMarker(new Vector3(5, 0, 0), cameraAt(10), 400, 200)

    assert.equal(placement.clamped, false)
    assert.ok(placement.x > 200)
  })

  void it('pulls the marker of a point behind the camera onto the canvas', () => {
    const placement = projectMarker(new Vector3(0, 0, 20), cameraAt(10), 400, 200)

    assert.equal(placement.clamped, true)
    assert.ok(placement.x >= 0)
    assert.ok(placement.x <= 400)
    assert.ok(placement.y >= 0)
    assert.ok(placement.y <= 200)
  })

  void it('pulls a point outside the frame to the edge, so the marker is always seen', () => {
    const placement = projectMarker(new Vector3(500, 0, 0), cameraAt(10), 400, 200)

    assert.equal(placement.clamped, true)
    // the point is far to the right, so the marker sits on the right edge, with the inset of the arrow
    assert.equal(Math.round(placement.x), 390)
  })

  void it('keeps the marker inside the canvas when it is clamped', () => {
    const below = projectMarker(new Vector3(0, -500, 0), cameraAt(10), 400, 200)

    assert.equal(below.clamped, true)
    assert.equal(Math.round(below.y), 190)
  })

  void it('follows the camera when it turns', () => {
    const camera = cameraAt(10)

    assert.equal(projectMarker(new Vector3(5, 0, 0), camera, 400, 200).clamped, false)

    // turned away by 90 degrees: the same point is outside the frame now, so it is clamped to the edge
    camera.quaternion.setFromEuler(new Euler(0, Math.PI / 2, 0))
    camera.updateMatrixWorld()

    assert.equal(projectMarker(new Vector3(5, 0, 0), camera, 400, 200).clamped, true)
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

/**
 * The size of the canvas of the tests, in CSS pixels.
 */
const CANVAS_WIDTH = 400

/**
 * The height of the canvas of the tests, in CSS pixels.
 */
const CANVAS_HEIGHT = 200

/**
 * The direction the camera of a pose looks at, read on the canvas of a fixed view.
 *
 * @remarks
 * A point ahead of the marker is projected, and the delta of the two projections is the direction of the
 * look on the canvas. It is the reference of the marker: that one turns the same direction by taking the dot
 * products of the look with the axes of the camera, a different sum over the same vectors, so the two have
 * to agree.
 *
 * @param pose The pose of the camera of the walkable view.
 * @param camera The camera of the fixed view.
 *
 * @returns The direction on the canvas, in the units of the screen (`x` right, `y` up).
 */
function referenceDirection(pose: CameraPose, camera: OrthographicCamera): { x: number; y: number } {
  const walk = new PerspectiveCamera()

  applyGameAngle(walk, pose.angle)
  walk.updateMatrixWorld()
  camera.updateMatrixWorld()

  const point = gamePositionToWorld(pose.position, scene)
  const ahead = point.clone().add(walk.getWorldDirection(new Vector3()).multiplyScalar(100))
  const from = point.clone().project(camera)
  const to = ahead.clone().project(camera)

  // the normalised device coordinates say nothing about the shape of the canvas on their own: a delta is
  // turned into pixels first, which is where the angle of the arrow lives
  return { x: (to.x - from.x) * (CANVAS_WIDTH / 2), y: (to.y - from.y) * (CANVAS_HEIGHT / 2) }
}

/**
 * Turns a screen direction into the angle of the marker: `0` points up, `90` to the right.
 *
 * @param direction The direction on the canvas, pair of a right and an up part (`x`, `y`).
 *
 * @returns The angle in degrees, between `0` and `360`.
 */
function degreesOf(direction: PixelOffset): number {
  const turned = (Math.atan2(direction.x, direction.y) * 180) / Math.PI

  return (turned + 360) % 360
}

/**
 * The side views: the ones that show the attitude of the camera.
 */
const SIDE_VIEWS = ['front', 'back', 'left', 'right'] as const

/**
 * Builds the combinations of the attitude test: every pitch with every yaw of every side view.
 *
 * @returns The cases, each with a view and the angles of a pose.
 */
function attitudeCases(): Array<{ mode: CameraViewMode; pitch: number; yaw: number }> {
  const cases: Array<{ mode: CameraViewMode; pitch: number; yaw: number }> = []

  for (const pitch of [0, 15, 30, -30, -60]) {
    for (const yaw of [0, 30, 90, 150, 210, 270, 330]) {
      for (const mode of SIDE_VIEWS) {
        cases.push({ mode, pitch, yaw })
      }
    }
  }

  return cases
}

/**
 * Builds the input of the marker for one view and one pose.
 *
 * @param mode The direction of the fixed view.
 * @param pose The pose of the camera of the walkable view.
 *
 * @returns The input of `markerState`.
 */
function inputOf(mode: CameraViewMode, pose: CameraPose | undefined): MarkerInput {
  return { mode, pose, player, scene, camera: cameraAt(10), width: CANVAS_WIDTH, height: CANVAS_HEIGHT }
}

/**
 * Builds a pose that looks down and turns by the given angles.
 *
 * @param pitch The game pitch, in degrees: positive looks down.
 * @param yaw The game yaw, in degrees.
 *
 * @returns The pose of the camera.
 */
function lookingAt(pitch: number, yaw: number): CameraPose {
  return { position: poseAt(yaw).position, angle: { pitch, yaw } }
}

void describe('markerState', () => {
  void it('shows no arrow without a pose', () => {
    const state = markerState(inputOf('top', undefined))

    // the spawn is out of this camera's frame, and it has no direction to draw either
    assert.equal(state.arrow, false)
  })

  void it('keeps the dot of the pose', () => {
    const state = markerState(inputOf('top', poseAt(90)))

    assert.equal(Math.round(state.x), 200)
    assert.equal(Math.round(state.y), 100)
  })
})

void describe('markerState in a plan view', () => {
  void it('turns the arrow with the yaw of the camera', () => {
    // the same camera, turned around by half: the arrow turns with it
    const first = markerState(inputOf('top', poseAt(90)))
    const second = markerState(inputOf('top', poseAt(270)))

    assert.equal(first.arrow, true)
    assert.equal(second.arrow, true)

    const difference = (first.degrees - second.degrees + 360) % 360

    assert.ok(Math.abs(difference - 180) < 1)
  })

  void it('leaves the arrow out when the camera looks along the axis of the view', () => {
    // the game yaw 0 looks towards +Z, straight into this fixed view: the direction has nothing on the canvas
    const state = markerState(inputOf('top', poseAt(0)))

    assert.equal(state.arrow, false)
  })

  void it('points where the camera looks, in every heading', () => {
    const poses = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((yaw) => {
      return lookingAt(0, yaw)
    })

    const misses = poses.filter((pose) => {
      const reference = referenceDirection(pose, cameraAt(10))

      // a look that points almost along the axis of the view has nothing to draw, and its threshold has its
      // own test: here the angles of the two sums are compared, where there is a direction at all
      if (Math.hypot(reference.x, reference.y) < 0.2) {
        return false
      }

      const state = markerState(inputOf('top', pose))

      if (!state.arrow) {
        return true
      }

      const expected = degreesOf(reference)

      return Math.abs(((state.degrees - expected + 540) % 360) - 180) > 1
    })

    assert.deepEqual(misses, [])
  })
})

void describe('markerState in a side view', () => {
  void it('tilts the arrow by the pitch, whatever the heading', () => {
    // the side views show the attitude: the tilt of the arrow is the pitch, and the yaw only picks the side
    // it leans to, so a look down of 30 degrees puts the arrow 30 degrees below the horizontal
    const misses = attitudeCases().filter((tested) => {
      const state = markerState(inputOf(tested.mode, lookingAt(tested.pitch, tested.yaw)))
      const tilt = Math.min(Math.abs(state.degrees - 90), Math.abs(state.degrees - 270))

      return !state.arrow || Math.abs(tilt - Math.abs(tested.pitch)) > 1
    })

    assert.deepEqual(misses, [])
  })

  void it('leans to the right for one heading and to the left for the opposite one', () => {
    // the tilt is measured from the horizontal it leans to, so the two are mirrored: right of the canvas
    // for the one, left of it for the other
    const right = markerState(inputOf('front', lookingAt(20, 90)))
    const left = markerState(inputOf('front', lookingAt(20, 270)))

    assert.equal(right.arrow, true)
    assert.equal(left.arrow, true)
    assert.ok(right.degrees > 90)
    assert.ok(right.degrees < 180)
    assert.ok(left.degrees > 180)
    assert.ok(left.degrees < 270)
  })

  void it('points above the horizontal when the camera looks up', () => {
    const state = markerState(inputOf('front', lookingAt(-20, 90)))

    assert.equal(state.arrow, true)
    assert.ok(state.degrees < 90 || state.degrees > 270)
  })
})
