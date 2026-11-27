import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { OrthographicCamera, PerspectiveCamera, Vector3, type Camera } from 'three'
import {
  gizmoPlaceOf,
  isSelectionOnView,
} from '../../../../../src/editor/components/widgets/View3DWidget/gizmoPlace.ts'

/**
 * A camera with a perspective, looking at the origin from ten units away.
 *
 * @returns The camera the tests project through.
 */
function perspectiveOf(): Camera {
  const camera = new PerspectiveCamera(60, 1, 0.1, 1000)

  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  return camera
}

/**
 * A flat camera, looking at the origin from ten units away.
 *
 * @returns The camera the tests project through, without a perspective.
 */
function flatOf(): Camera {
  const camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 1000)

  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()

  return camera
}

/**
 * The cameras of the tests: one with a perspective, one flat.
 */
const CAMERAS: ReadonlyArray<{ readonly label: string; readonly camera: Camera }> = [
  { label: 'a perspective camera', camera: perspectiveOf() },
  { label: 'an orthographic camera', camera: flatOf() },
]

/**
 * Tells whether a place of the gizmo stands in the middle of the view.
 *
 * @param camera The camera the handle is seen through.
 * @param place The place of the handle in the world.
 *
 * @returns True when the place projects to the middle of the view.
 */
function isInTheMiddle(camera: Camera, place: Vector3): boolean {
  const projected = place.clone().project(camera)

  return Math.abs(projected.x) < 0.01 && Math.abs(projected.y) < 0.01 && projected.z <= 1
}

for (const { label, camera } of CAMERAS) {
  void describe(`gizmoPlaceOf with ${label}`, () => {
    void it('keeps the handle on a pivot that is on the view', () => {
      const pivot = new Vector3(0, 0, 0)

      assert.deepEqual(gizmoPlaceOf(camera, pivot), pivot)
    })

    void it('pulls the handle of a pivot off the view toward the middle, as far as the view allows', () => {
      // a middle far to the right: the arrows of it are past the edge of the canvas, and the handle stays over the mesh
      const placed = gizmoPlaceOf(camera, new Vector3(400, 0, 0))
      const projected = placed.clone().project(camera)

      assert.equal(Math.abs(projected.x) <= 0.55, true)
      assert.equal(Math.abs(projected.y) <= 0.55, true)
    })

    void it('keeps the handle in front of the camera', () => {
      // a middle behind the camera: the handle goes to the far plane of the clip space
      const placed = gizmoPlaceOf(camera, new Vector3(0, 0, 40))

      assert.equal(isInTheMiddle(camera, placed), true)
    })
  })
}

void describe('isSelectionOnView', () => {
  void it('sees a box in front of the camera', () => {
    const bounds = { minX: -1, maxX: 1, minY: -1, maxY: 1, minZ: -1, maxZ: 1 }

    assert.equal(isSelectionOnView(perspectiveOf(), bounds), true)
  })

  void it('does not see a box far out of the view', () => {
    const bounds = { minX: 400, maxX: 500, minY: 400, maxY: 500, minZ: 400, maxZ: 500 }

    assert.equal(isSelectionOnView(perspectiveOf(), bounds), false)
  })
})
