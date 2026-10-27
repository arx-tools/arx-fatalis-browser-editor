import { type Box3, type PerspectiveCamera, AmbientLight, DirectionalLight, type Scene, Vector3 } from 'three'
import { Color } from '../../../_generator/Color.ts'

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
