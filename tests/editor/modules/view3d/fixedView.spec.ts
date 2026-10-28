import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import {
  alignPose,
  frustumOf,
  type CameraBounds,
  type CameraViewMode,
} from '../../../../src/editor/modules/view3d/cameraAlign.ts'
import { gamePositionToWorld } from '../../../../src/editor/modules/view3d/cameraPose.ts'
import { frameFixedView } from '../../../../src/editor/modules/view3d/fixedView.ts'

/**
 * The scene position of the test level.
 */
const scene: ArxVector3 = { x: 5250, y: 1225, z: 4350 }

/**
 * The box the views are framed to.
 */
const bounds: CameraBounds = {
  min: { x: -1000, y: -200, z: -500 },
  max: { x: 1000, y: 600, z: 1500 },
}

/**
 * The centre of {@link bounds}.
 */
const centre: ArxVector3 = { x: 0, y: 200, z: 500 }

/**
 * The field of view of the widgets.
 */
const fieldOfView = 75

/**
 * The aspect ratio of a widget in the dock.
 */
const aspect = 1.157

/**
 * The directions of the six widgets.
 */
const modes: readonly CameraViewMode[] = ['top', 'bottom', 'front', 'back', 'left', 'right']

/**
 * Builds a camera whose far plane is too short on purpose: the framing has to set it.
 *
 * @returns A camera of the widget's field of view and aspect.
 */
function buildCamera(): PerspectiveCamera {
  return new PerspectiveCamera(fieldOfView, aspect, 0.1, 1)
}

/**
 * Reads the eight corners of the box, in the three.js space.
 *
 * @returns The eight corners, in the order of the nested loops.
 */
function worldCorners(): Vector3[] {
  const corners: Vector3[] = []

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push(gamePositionToWorld({ x, y, z }, scene))
      }
    }
  }

  return corners
}

void describe('frameFixedView', () => {
  void it('puts the camera to the pose of the direction', () => {
    const camera = buildCamera()
    const pose = frameFixedView(camera, { mode: 'left', bounds, scene, fieldOfView, aspect })

    assert.deepEqual(pose, alignPose('left', bounds, frustumOf(fieldOfView, aspect)))
    assert.ok(camera.position.distanceTo(gamePositionToWorld(pose.position, scene)) < 1e-6)
  })

  void it('looks at the centre of the level in every direction', () => {
    const misses = modes.filter((mode) => {
      const camera = buildCamera()

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect })

      const toCentre = gamePositionToWorld(centre, scene).sub(camera.position).normalize()

      return camera.getWorldDirection(new Vector3()).dot(toCentre) <= 0.999
    })

    assert.deepEqual(misses, [])
  })

  void it('keeps the whole level between the near and the far plane', () => {
    const misses = modes.filter((mode) => {
      const camera = buildCamera()

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect })

      const distances = worldCorners().map((corner) => {
        return camera.position.distanceTo(corner)
      })

      return Math.min(...distances) <= camera.near || Math.max(...distances) >= camera.far
    })

    assert.deepEqual(misses, [])
  })

  void it('sets the projection of the framed camera', () => {
    const camera = buildCamera()

    frameFixedView(camera, { mode: 'front', bounds, scene, fieldOfView, aspect })

    assert.equal(camera.aspect, aspect)
    assert.ok(camera.near > 0)
    assert.ok(camera.far > camera.near)
  })
})
