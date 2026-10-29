import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OrthographicCamera, Vector3 } from 'three'
import {
  DEPTH_AXIS_OF,
  offsetOnPlane,
  planePointAt,
  targetPositionOf,
  worldUnitsPerPixel,
} from '../../../../../src/editor/components/widgets/FixedViewWidget/fixedViewTarget.ts'
import type { CameraViewMode } from '../../../../../src/editor/components/widgets/FixedViewWidget/cameraAlign.ts'

/**
 * The game axis of every direction: what the view shows and what it can not change.
 */

/**
 * How many pixels the test canvas of the plane pick has.
 */
const CANVAS = 200

/**
 * Builds an orthographic camera standing on the `+Z` side of the origin, looking at it.
 *
 * @remarks
 * The canvas of the test is square (`CANVAS`), so the frame of the camera is square too: a pixel is the
 * same size on both axes.
 *
 * @returns The camera, with the projection matrix ready for a projection.
 */
function camera(): OrthographicCamera {
  const created = new OrthographicCamera(-2, 2, 2, -2, 0.1, 100)
  created.position.set(0, 0, 5)
  created.lookAt(0, 0, 0)
  created.updateProjectionMatrix()
  created.updateMatrixWorld()

  return created
}

/**
 * Where a point of the mesh space lands on the canvas.
 *
 * @remarks
 * The canvas is square, like the aspect ratio of the test camera: the horizontal scale of a projection
 * follows the aspect ratio, and a difference there would look like an error of the offset.
 *
 * @param point The point to project.
 * @param view The camera of the fixed view.
 *
 * @returns The position on the canvas, in CSS pixels.
 */
function pixelsOf(point: Vector3, view: OrthographicCamera): { x: number; y: number } {
  view.updateMatrixWorld()
  const ndc = point.clone().project(view)

  return { x: ((ndc.x + 1) / 2) * CANVAS, y: ((1 - ndc.y) / 2) * CANVAS }
}

void describe('targetPositionOf', () => {
  /**
   * The place the click hit.
   */
  const hit = { x: 10, y: 20, z: 30 }

  /**
   * Where the camera stands now.
   */
  const current = { x: 100, y: 200, z: 300 }

  void it('keeps the depth axis and takes the other two from the hit', () => {
    assert.deepEqual(targetPositionOf('top', hit, current), { x: 10, y: 200, z: 30 })
    assert.deepEqual(targetPositionOf('bottom', hit, current), { x: 10, y: 200, z: 30 })
    assert.deepEqual(targetPositionOf('front', hit, current), { x: 10, y: 20, z: 300 })
    assert.deepEqual(targetPositionOf('back', hit, current), { x: 10, y: 20, z: 300 })
    assert.deepEqual(targetPositionOf('left', hit, current), { x: 100, y: 20, z: 30 })
    assert.deepEqual(targetPositionOf('right', hit, current), { x: 100, y: 20, z: 30 })
  })

  void it('names the axis the view looks along for every direction', () => {
    assert.deepEqual(DEPTH_AXIS_OF, {
      top: 'y',
      bottom: 'y',
      front: 'z',
      back: 'z',
      left: 'x',
      right: 'x',
    })
  })

  void it('leaves the height of a plan view alone', () => {
    const modes: readonly CameraViewMode[] = ['top', 'bottom']

    const heights = modes.map((mode) => {
      return targetPositionOf(mode, hit, current).y
    })

    assert.deepEqual(heights, [200, 200])
  })

  void it('does not change the position when the hit is the place of the camera', () => {
    assert.deepEqual(targetPositionOf('top', current, current), current)
  })
})

void describe('worldUnitsPerPixel', () => {
  void it('measures the height of the frame over the pixels of the canvas', () => {
    // the frame of the test camera is 4 units high, over the 200 pixels of the canvas
    const expected = 4 / CANVAS
    const scale = worldUnitsPerPixel(camera(), CANVAS)

    assert.ok(Math.abs(scale - expected) < 1e-9)
  })

  void it('shrinks with the zoom and with a bigger canvas', () => {
    const plain = worldUnitsPerPixel(camera(), CANVAS)
    const zoomedCamera = camera()
    zoomedCamera.zoom = 2
    const zoomed = worldUnitsPerPixel(zoomedCamera, CANVAS)
    const wide = worldUnitsPerPixel(camera(), CANVAS * 2)

    assert.ok(zoomed < plain)
    assert.ok(wide < plain)
  })
})

void describe('offsetOnPlane', () => {
  void it('puts the moved point under the moved pointer', () => {
    const view = camera()
    const start = new Vector3(0, 0, 0)
    const before = pixelsOf(start, view)

    const moved = offsetOnPlane(start, view, { x: 12, y: -7 }, CANVAS)
    const after = pixelsOf(moved, view)

    assert.ok(Math.abs(after.x - (before.x + 12)) < 1e-6)
    assert.ok(Math.abs(after.y - (before.y - 7)) < 1e-6)
  })

  void it('stays on the plane of the start, so the depth does not change', () => {
    const view = camera()
    const start = new Vector3(0, 0, 0)
    const moved = offsetOnPlane(start, view, { x: 40, y: 20 }, CANVAS)

    // the camera looks down -Z from z = 5: the plane of the start is z = 0
    assert.ok(Math.abs(moved.z) < 1e-9)
  })

  void it('does not move for a zero offset', () => {
    const view = camera()
    const moved = offsetOnPlane(new Vector3(1, 2, 3), view, { x: 0, y: 0 }, CANVAS)

    assert.ok(moved.distanceTo(new Vector3(1, 2, 3)) < 1e-9)
  })
})

void describe('planePointAt', () => {
  void it('reads the canvas centre as the point of the plane on the axis of the camera', () => {
    const place = planePointAt(
      { x: CANVAS / 2, y: CANVAS / 2, width: CANVAS, height: CANVAS },
      camera(),
      new Vector3(0, 0, 0),
    )

    assert.ok(place)
    assert.ok(place.distanceTo(new Vector3(0, 0, 0)) < 1e-6)
  })

  void it('answers with a point of the plane of the walkable camera, whatever its depth', () => {
    // the plane goes through the walkable camera: the depth of the answer is the depth of that point, so a
    // click never changes the axis the view looks along
    const place = planePointAt({ x: 40, y: 160, width: CANVAS, height: CANVAS }, camera(), new Vector3(3, -2, 0))

    assert.ok(place)
    assert.ok(Math.abs(place.z) < 1e-6)
  })

  void it('answers with a point that projects back to the clicked pixel', () => {
    const view = camera()
    const through = new Vector3(3, -2, 0)
    const places = [
      { x: 0, y: 0 },
      { x: 40, y: 160 },
      { x: 199, y: 199 },
      { x: 150, y: 30 },
    ]

    const misses = places.filter((pixel) => {
      const place = planePointAt({ ...pixel, width: CANVAS, height: CANVAS }, view, through)

      if (place === undefined) {
        return true
      }

      const back = pixelsOf(place, view)

      return Math.abs(back.x - pixel.x) > 1e-6 || Math.abs(back.y - pixel.y) > 1e-6
    })

    assert.deepEqual(misses, [])
  })

  void it('has nothing to read when the walkable camera is behind the fixed one', () => {
    assert.equal(
      planePointAt({ x: CANVAS / 2, y: CANVAS / 2, width: CANVAS, height: CANVAS }, camera(), new Vector3(0, 0, 20)),
      undefined,
    )
  })
})
