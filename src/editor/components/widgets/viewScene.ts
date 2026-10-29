import { PerspectiveCamera, Scene, WebGLRenderer, type Camera } from 'three'
import { fitCameraToCanvas } from './levelScene.ts'

/**
 * The renderer, the scene and the camera of one widget that shows the level.
 *
 * @remarks
 * The editor has more than one 3D widget (the walkable view and the six fixed directions), and they all
 * need the same three objects, so they are built here instead of in every widget. The **lights are not**
 * part of it: each widget adds what it wants (both use `addPreviewLights` today), so a later lighting round
 * can change the walkable view without touching the small ones (TODO 92).
 */
export interface ViewScene<TCamera extends Camera = Camera> {
  /**
   * The renderer of the canvas of the widget.
   */
  readonly renderer: WebGLRenderer
  /**
   * The scene of the widget; the level meshes are added by the widget, the lights are already in it.
   */
  readonly scene: Scene
  /**
   * The camera of the widget: a perspective one for the walkable view, an orthographic one for the fixed
   * views (a map has no perspective).
   */
  readonly camera: TCamera
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
 * Builds the renderer, the scene and the camera of a widget.
 *
 * @param canvas The canvas of the widget.
 * @param camera The camera of the widget: the caller knows whether the view is perspective (the walkable
 * one) or orthographic (a map of a fixed view).
 *
 * @returns The scene the widget draws, without lights (the widget adds them).
 */
export function createViewScene<TCamera extends Camera>(
  canvas: HTMLCanvasElement,
  camera: TCamera,
): ViewScene<TCamera> {
  const renderer = new WebGLRenderer({ canvas, antialias: true })

  renderer.setPixelRatio(window.devicePixelRatio)

  return { renderer, scene: new Scene(), camera }
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

  // an orthographic camera has no aspect ratio: its frame is set by the framing of the widget
  if (view.camera instanceof PerspectiveCamera) {
    fitCameraToCanvas(view.camera, width, height)
  }
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
