import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AmbientLight,
  Box3,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three'
import {
  addPreviewLights,
  fitCameraToCanvas,
  frameLevel,
  gameBoundsOf,
  previewMaterial,
  viewMeshesOf,
} from '../../../../src/editor/components/widgets/levelScene.ts'
import { accelerateRaycast, createLevelMaterial } from '../../../../src/generator/meshes.ts'

/**
 * The scene position of the test level.
 */
const scene = { x: 5250, y: 1225, z: 4350 }

/**
 * Builds a mesh with a known bounding box and no vertices.
 *
 * @param box The bounding box of the mesh.
 *
 * @returns A mesh whose geometry has that box, without a single vertex.
 */
function meshOf(box: Box3): Mesh {
  const geometry = new BufferGeometry()
  geometry.boundingBox = box

  return new Mesh(geometry)
}

void describe('addPreviewLights', () => {
  void it('adds an ambient and a directional light', () => {
    const scene = new Scene()
    addPreviewLights(scene)

    assert.equal(
      scene.children.some((child) => {
        return child instanceof AmbientLight
      }),
      true,
    )
    assert.equal(
      scene.children.some((child) => {
        return child instanceof DirectionalLight
      }),
      true,
    )
  })
})

void describe('frameLevel', () => {
  void it('puts the camera outside the box and aims it at the centre', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
    const box = new Box3(new Vector3(-100, -50, -100), new Vector3(100, 50, 100))

    frameLevel(camera, box)

    const centre = box.getCenter(new Vector3())

    assert.ok(camera.position.distanceTo(centre) > 100)
    assert.ok(camera.near > 0)
    assert.ok(camera.far > camera.position.distanceTo(centre))
  })

  void it('keeps a working camera for a tiny level', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)
    const box = new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1))

    frameLevel(camera, box)

    assert.ok(Number.isFinite(camera.position.x))
    assert.ok(camera.near > 0)
  })
})

void describe('fitCameraToCanvas', () => {
  void it('follows the aspect ratio of the canvas', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)

    fitCameraToCanvas(camera, 800, 400)

    assert.equal(camera.aspect, 2)
  })

  void it('avoids a division by zero for a hidden canvas', () => {
    const camera = new PerspectiveCamera(75, 1, 0.1, 10_000)

    fitCameraToCanvas(camera, 800, 0)

    assert.equal(camera.aspect, 1)
  })
})

void describe('gameBoundsOf', () => {
  void it('gives nothing back when there is no level', () => {
    assert.equal(gameBoundsOf([], { x: 0, y: 0, z: 0 }), undefined)
  })

  void it('skips a mesh without a bounding box', () => {
    const geometry = new BufferGeometry()

    assert.equal(gameBoundsOf([new Mesh(geometry)], scene), undefined)
  })

  void it('converts the box back into the game, where the mirrored axes swap the corners', () => {
    const mesh = meshOf(new Box3(new Vector3(-100, -50, -100), new Vector3(100, 50, 100)))

    assert.deepEqual(gameBoundsOf([mesh], scene), {
      min: { x: 5150, y: 1175, z: 4250 },
      max: { x: 5350, y: 1275, z: 4450 },
    })
  })

  void it('takes the box of every mesh', () => {
    const first = meshOf(new Box3(new Vector3(0, 0, 0), new Vector3(10, 10, 10)))
    const second = meshOf(new Box3(new Vector3(-20, -20, -20), new Vector3(-10, -10, -10)))

    // the game mirrors X and Y around the scene position and shifts Z by it
    assert.deepEqual(gameBoundsOf([first, second], scene), {
      min: { x: 5240, y: 1215, z: 4330 },
      max: { x: 5270, y: 1245, z: 4360 },
    })
  })
})

void describe('viewMeshesOf', () => {
  void it('wraps the same geometry and material into new meshes', () => {
    const geometry = new BufferGeometry()
    const material = new MeshLambertMaterial()
    const original = new Mesh(geometry, material)

    const [wrapped] = viewMeshesOf([original])

    assert.notEqual(wrapped, original)
    assert.equal(wrapped?.geometry, geometry)
    assert.equal(wrapped?.material, material)
  })

  void it('keeps the raycast of the wrapped mesh, so the BVH of the level comes along', () => {
    const geometry = new PlaneGeometry(2, 2)
    const original = new Mesh(geometry, new MeshLambertMaterial())

    accelerateRaycast(original)

    const [wrapped] = viewMeshesOf([original])

    assert.equal(wrapped?.raycast, original.raycast)
    assert.equal(wrapped?.geometry.boundsTree, geometry.boundsTree)
  })

  void it('takes the material it is given, and leaves the map untouched', () => {
    const geometry = new BufferGeometry()
    const own = new MeshLambertMaterial()
    const preview = new MeshLambertMaterial()
    const original = new Mesh(geometry, own)

    const [wrapped] = viewMeshesOf([original], preview)

    assert.equal(wrapped?.geometry, geometry)
    assert.equal(wrapped?.material, preview)
    assert.equal(original.material, own)
  })

  void it('gives a fresh set every time, so every scene has its own', () => {
    const original = meshOf(new Box3(new Vector3(0, 0, 0), new Vector3(1, 1, 1)))

    const first = viewMeshesOf([original])
    const second = viewMeshesOf([original])

    assert.notEqual(first[0], second[0])
  })

  void it('keeps one mesh per input mesh', () => {
    const first = meshOf(new Box3())
    const second = meshOf(new Box3())

    assert.equal(viewMeshesOf([first, second]).length, 2)
  })
})

void describe('previewMaterial', () => {
  void it('is a flat neutral material without a texture', () => {
    const material = previewMaterial()

    assert.equal(material.map, null)
    assert.equal(material instanceof MeshLambertMaterial, true)
  })

  void it('is not the material of the level', () => {
    // the small views keep their own face: a later texture or lighting round changes the store's material
    assert.notEqual(previewMaterial(), createLevelMaterial())
  })

  void it('is the same instance for every widget', () => {
    assert.equal(previewMaterial(), previewMaterial())
  })
})
