import type { ArxVector3 } from 'arx-convert/types'
import { Box3, Mesh, type PerspectiveCamera, AmbientLight, DirectionalLight, type Scene, Vector3 } from 'three'
import { Color } from '../../../generator/Color.ts'
import type { CameraBounds } from './cameraAlign.ts'
import { worldPositionToGame } from './cameraPose.ts'

/**
 * The distance multiplier the camera keeps from the level, in radii.
 *
 * A bit more than one, so the whole bounding sphere fits into the view.
 */
const CAMERA_DISTANCE = 1.6

/**
 * Adds the light the flat material needs.
 *
 * @remarks
 * This is **not** the lighting of the level: the LLF round will bring the baked vertex colours and the
 * point lights. Here a hemisphere-like pair of an ambient and a directional light just makes the
 * geometry readable.
 *
 * @param scene The scene to add the lights to.
 */
export function addPreviewLights(scene: Scene): void {
  scene.add(new AmbientLight(Color.white.getHex(), 1.6))

  const sun = new DirectionalLight(Color.white.getHex(), 1.4)
  sun.position.set(-0.6, 1, 0.4)
  scene.add(sun)
}

/**
 * Places the camera so the whole level fits into the view.
 *
 * @remarks
 * The level is a few thousand units wide, so a fixed camera position would be either inside the ground
 * or far above it. The camera looks at the centre of the bounding box from a corner, at a distance
 * derived from the size of the box and the field of view.
 *
 * @param camera The camera to move.
 * @param box The bounding box of the level.
 */
export function frameLevel(camera: PerspectiveCamera, box: Box3): void {
  const centre = box.getCenter(new Vector3())
  const size = box.getSize(new Vector3())
  const radius = Math.max(size.length() / 2, 1)
  const distance = (radius * CAMERA_DISTANCE) / Math.sin((camera.fov * Math.PI) / 360)

  camera.position.copy(centre).add(new Vector3(1, 0.8, 1).normalize().multiplyScalar(distance))
  camera.lookAt(centre)
  camera.near = Math.max(distance / 1000, 0.1)
  camera.far = distance * 4
  camera.updateProjectionMatrix()
}

/**
 * Fits the camera to the aspect ratio of the canvas.
 *
 * @param camera The camera whose aspect ratio follows the canvas.
 * @param width The current width of the canvas in pixels.
 * @param height The current height of the canvas in pixels.
 */
export function fitCameraToCanvas(camera: PerspectiveCamera, width: number, height: number): void {
  let aspect = 1

  if (height > 0) {
    aspect = width / height
  }

  camera.aspect = aspect
  camera.updateProjectionMatrix()
}

/**
 * Reads the box of the level in the game's coordinates.
 *
 * @remarks
 * - the geometry of the meshes is built in the three.js space (the mesh itself is not moved), so the two
 * corners of the combined box are converted back
 * - the conversion mirrors X and Y, which swaps the corners: the smaller and the larger one are picked
 * per axis
 *
 * @param meshes The meshes of the level, each with a computed bounding box.
 * @param scene The scene position of the level, the origin of the conversion.
 *
 * @returns The box of the level, or `undefined` when no mesh has a bounding box.
 */
export function gameBoundsOf(meshes: readonly Mesh[], scene: ArxVector3): CameraBounds | undefined {
  const box = new Box3()

  for (const mesh of meshes) {
    const geometryBox = mesh.geometry.boundingBox

    if (geometryBox === null) {
      continue
    }

    box.union(geometryBox)
  }

  if (box.isEmpty()) {
    return undefined
  }

  const first = worldPositionToGame(box.min, scene)
  const second = worldPositionToGame(box.max, scene)

  return {
    min: {
      x: Math.min(first.x, second.x),
      y: Math.min(first.y, second.y),
      z: Math.min(first.z, second.z),
    },
    max: {
      x: Math.max(first.x, second.x),
      y: Math.max(first.y, second.y),
      z: Math.max(first.z, second.z),
    },
  }
}

/**
 * Wraps the meshes of the map for one scene.
 *
 * @remarks
 * The geometry and the material belong to the map, but a `Mesh` is the wrapper that puts them into a
 * scene, and one wrapper can only be in **one** scene: adding the same mesh to a second scene takes it
 * out of the first. The editor has more than one 3D widget (the walkable view and the six directions),
 * so every widget builds its own wrappers over the same geometry and material.
 *
 * @param meshes The meshes of the map.
 *
 * @returns New meshes over the same geometries and materials.
 */
export function viewMeshesOf(meshes: readonly Mesh[]): Mesh[] {
  return meshes.map((mesh) => {
    return new Mesh(mesh.geometry, mesh.material)
  })
}
