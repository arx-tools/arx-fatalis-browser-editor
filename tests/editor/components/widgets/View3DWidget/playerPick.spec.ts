import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three'
import { playerIsNearest } from '../../../../../src/editor/components/widgets/View3DWidget/useSelectionDrag.ts'

/**
 * A mesh at a place along the view of the camera.
 *
 * @param z How far the mesh stands in front of the camera.
 *
 * @returns The mesh of a box, at that place.
 */
function meshAt(z: number): Mesh {
  const mesh = new Mesh(new BoxGeometry(10, 10, 10), new MeshBasicMaterial())

  mesh.position.set(0, 0, z)
  // the scene of the view updates the matrices of its objects on every frame: the test stands in for that
  mesh.updateMatrixWorld()

  return mesh
}

/**
 * A camera at the origin, looking along the negative Z axis, the way the view looks.
 *
 * @returns The camera of the test.
 */
function cameraOf(): PerspectiveCamera {
  return new PerspectiveCamera(75, 1, 0.1, 1000)
}

void describe('playerIsNearest', () => {
  void it('takes the model in front of the level as the target of the crosshair', () => {
    assert.equal(playerIsNearest(cameraOf(), [meshAt(-30)], [meshAt(-10)]), true)
  })

  void it('leaves the model behind the level alone: the wall is what the author looks at', () => {
    assert.equal(playerIsNearest(cameraOf(), [meshAt(-10)], [meshAt(-30)]), false)
  })

  void it('gives nothing to pick without a model', () => {
    assert.equal(playerIsNearest(cameraOf(), [meshAt(-10)], []), false)
  })

  void it('takes the model when the level has nothing in front of the crosshair', () => {
    // the model of the spawn hangs in an empty room: the ray meets it, and no face of the level is behind it
    assert.equal(playerIsNearest(cameraOf(), [], [meshAt(-10)]), true)
  })

  void it('leaves the model out when the crosshair does not point at it', () => {
    const side = meshAt(-10)

    side.position.x = 100
    side.updateMatrixWorld()

    assert.equal(playerIsNearest(cameraOf(), [meshAt(-60)], [side]), false)
  })
})
