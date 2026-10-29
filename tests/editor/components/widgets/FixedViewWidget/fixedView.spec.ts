import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OrthographicCamera, Vector3 } from 'three'
import type { ArxVector3 } from 'arx-convert/types'
import type { CameraBounds } from '../../../../../src/editor/components/widgets/cameraBounds.ts'
import {
  alignPose,
  frustumOf,
  type CameraViewMode,
} from '../../../../../src/editor/components/widgets/FixedViewWidget/cameraAlign.ts'
import { gamePositionToWorld } from '../../../../../src/editor/components/widgets/cameraPose.ts'
import { MAX_ZOOM, frameFixedView } from '../../../../../src/editor/components/widgets/FixedViewWidget/fixedView.ts'

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
 * Builds an orthographic camera whose frame and far plane are short on purpose: the framing sets them.
 *
 * @returns The camera of a fixed view.
 */
function buildCamera(): OrthographicCamera {
  return new OrthographicCamera(-1, 1, 1, -1, 0.1, 1)
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

  void it('frames the whole level in the orthographic rectangle', () => {
    const misses = modes.filter((mode) => {
      const camera = buildCamera()

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect })
      camera.updateMatrixWorld()

      const outside = worldCorners().filter((corner) => {
        const ndc = corner.clone().project(camera)

        return Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1
      })

      return outside.length > 0
    })

    assert.deepEqual(misses, [])
  })

  void it('fills the frame with the level, with the margin of the framing', () => {
    const camera = buildCamera()

    frameFixedView(camera, { mode: 'front', bounds, scene, fieldOfView, aspect })
    camera.updateMatrixWorld()

    const widths = worldCorners().map((corner) => {
      return Math.abs(corner.clone().project(camera).x)
    })

    // the margin is 0.9 of the frame: the widest corner lands near it, not in the middle
    assert.ok(Math.max(...widths) > 0.6)
    assert.ok(Math.max(...widths) <= 1)
  })

  void it('sets the projection of the framed camera', () => {
    const camera = buildCamera()

    frameFixedView(camera, { mode: 'front', bounds, scene, fieldOfView, aspect })

    assert.ok(camera.right > camera.left)
    assert.ok(camera.top > camera.bottom)
    assert.ok(camera.near > 0)
    assert.ok(camera.far > camera.near)
  })
})

void describe('frameFixedView with a zoom', () => {
  void it('keeps the framed pose at the first step of the zoom', () => {
    const camera = buildCamera()
    const pose = frameFixedView(camera, { mode: 'top', bounds, scene, fieldOfView, aspect, zoom: 1 })

    assert.ok(camera.position.distanceTo(gamePositionToWorld(pose.position, scene)) < 1e-6)
  })

  void it('walks the camera towards the centre of the level', () => {
    const framed = buildCamera()
    const zoomed = buildCamera()

    frameFixedView(framed, { mode: 'top', bounds, scene, fieldOfView, aspect })
    frameFixedView(zoomed, { mode: 'top', bounds, scene, fieldOfView, aspect, zoom: 4 })

    const framedDistance = framed.position.distanceTo(gamePositionToWorld(centre, scene))
    const zoomedDistance = zoomed.position.distanceTo(gamePositionToWorld(centre, scene))

    const expected = framedDistance / 4

    assert.ok(Math.abs(zoomedDistance - expected) < 1e-6)
  })

  void it('keeps the centre of the level in the middle of the canvas', () => {
    const misses = modes.filter((mode) => {
      const camera = buildCamera()

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect, zoom: 4 })
      camera.updateMatrixWorld()

      const middle = gamePositionToWorld(centre, scene).project(camera)

      return Math.abs(middle.x) > 1e-6 || Math.abs(middle.y) > 1e-6
    })

    assert.deepEqual(misses, [])
  })

  void it('keeps the target in the middle of the canvas when one is given', () => {
    // the zoomed view is a magnifier around the camera: the marker of the walkable view has to project to
    // the middle, so a pose change can be followed by framing again
    const misses = modes.filter((mode) => {
      const camera = buildCamera()
      const target = gamePositionToWorld({ x: 300, y: 100, z: 200 }, scene)

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect, zoom: 4, target })
      camera.updateMatrixWorld()

      const middle = target.clone().project(camera)

      return Math.abs(middle.x) > 1e-6 || Math.abs(middle.y) > 1e-6
    })

    assert.deepEqual(misses, [])
  })

  void it('keeps the distance from the level centre the same, whatever the camera does', () => {
    // the point of the anchoring: a click moves the walkable camera, and the fixed view must not move with
    // it, so the framing only depends on the zoom, never on a pose
    const first = buildCamera()
    const second = buildCamera()

    frameFixedView(first, { mode: 'top', bounds, scene, fieldOfView, aspect, zoom: 3 })
    frameFixedView(second, { mode: 'top', bounds, scene, fieldOfView, aspect, zoom: 3 })

    assert.ok(first.position.distanceTo(second.position) < 1e-9)
  })

  void it('looks the same way as the framed view', () => {
    const framed = buildCamera()
    const zoomed = buildCamera()

    frameFixedView(framed, { mode: 'left', bounds, scene, fieldOfView, aspect })
    frameFixedView(zoomed, { mode: 'left', bounds, scene, fieldOfView, aspect, zoom: 3 })

    const a = framed.getWorldDirection(new Vector3())
    const b = zoomed.getWorldDirection(new Vector3())

    assert.ok(a.dot(b) > 0.999)
  })

  void it('keeps the whole level inside the far plane when it is zoomed in', () => {
    const misses = modes.filter((mode) => {
      const camera = buildCamera()

      frameFixedView(camera, { mode, bounds, scene, fieldOfView, aspect, zoom: 8 })

      // the far side of the level is behind the marker now, and it must not be cut off
      const farthest = Math.max(
        ...worldCorners().map((corner) => {
          return camera.position.distanceTo(corner)
        }),
      )

      return farthest >= camera.far
    })

    assert.deepEqual(misses, [])
  })

  void it('clamps the zoom to the range of the widget', () => {
    const low = buildCamera()
    const high = buildCamera()
    const pose = alignPose('front', bounds, frustumOf(fieldOfView, aspect))

    frameFixedView(low, { mode: 'front', bounds, scene, fieldOfView, aspect, zoom: 0.2 })
    frameFixedView(high, { mode: 'front', bounds, scene, fieldOfView, aspect, zoom: 100 })

    assert.ok(low.position.distanceTo(gamePositionToWorld(pose.position, scene)) < 1e-6)
    assert.equal(low.zoom, 1)
    assert.equal(high.zoom, MAX_ZOOM)

    // the camera walks in towards the target as well, so the near plane of a deep zoom does not cut it
    const target = gamePositionToWorld(centre, scene)
    const distance = gamePositionToWorld(pose.position, scene).distanceTo(target)
    const expected = distance / MAX_ZOOM

    assert.ok(Math.abs(high.position.distanceTo(target) - expected) < 1e-6)
  })
})
