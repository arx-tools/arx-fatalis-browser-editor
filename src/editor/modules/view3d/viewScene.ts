import { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { addPreviewLights, fitCameraToCanvas } from './levelScene.ts'

/**
 * The renderer, the scene and the camera of one widget that shows the level.
 *
 * @remarks
 * The editor has more than one 3D widget (the walkable view and the six fixed directions), and they all
 * need the same three objects with the same lights, so they are built here instead of in every widget.
 */
export interface ViewScene {
  /**
   * The renderer of the canvas of the widget.
   */
  readonly renderer: WebGLRenderer
  /**
   * The scene of the widget; the level meshes are added by the widget, the lights are already in it.
   */
  readonly scene: Scene
  /**
   * The camera of the widget.
   */
  readonly camera: PerspectiveCamera
}

/**
 * The field of view of every 3D widget, in degrees.
 *
 * @remarks
 * The archived editor used `75` as well, and the camera widget, the fixed views and the walkable view
 * should frame the level the same way.
 */
export const FIELD_OF_VIEW = 75

/**
 * Builds the renderer, the scene (with the preview lights) and the camera of a widget.
 *
 * @param canvas The canvas of the widget.
 *
 * @returns The scene the widget draws.
 */
export function createViewScene(canvas: HTMLCanvasElement): ViewScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true })

  renderer.setPixelRatio(window.devicePixelRatio)

  const scene = new Scene()

  addPreviewLights(scene)

  return { renderer, scene, camera: new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.1, 10_000) }
}

/**
 * Fits the renderer and the camera to the size of the widget.
 *
 * @remarks
 * The dock moves and resizes the widget node, so the canvas has to follow it. The direction of a view
 * does not change with the aspect ratio, but the level has to stay in the frame, so the caller reframes
 * the camera after this.
 *
 * @param view The scene of the widget.
 * @param width The width of the widget in css pixels.
 * @param height The height of the widget in css pixels.
 */
export function resizeViewScene(view: ViewScene, width: number, height: number): void {
  view.renderer.setSize(width, height, false)
  fitCameraToCanvas(view.camera, width, height)
}

/**
 * Frees the GPU resources of the widget.
 *
 * @remarks
 * Only the renderer is disposed: the meshes of the level belong to the store, and every 3D widget shows
 * the same ones, so the materials and the geometries stay untouched (a widget that is removed and added
 * back shows the level at once).
 *
 * @param view The scene of the widget.
 */
export function disposeViewScene(view: ViewScene): void {
  view.renderer.dispose()
}
