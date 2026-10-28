import type { PerspectiveCamera, WebGLRenderer } from 'three'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'

/**
 * The orientation compass in the corner of the walkable view.
 *
 * @remarks
 * It is three's own `ViewHelper` (the one the old app used at the `_old/main.ts` render loop): a small
 * axis triad that turns with the camera, so the orientation of the view is readable at a glance without
 * moving the pointer. It draws in its own 128 px viewport over the rendered frame, in the bottom-right
 * corner of the canvas (the `ViewHelper` default), and it restores the viewport afterwards.
 *
 * The helper renders with the renderer's own `render()`, which would clear the colour buffer of the frame
 * that is already there (the old app turned the auto clear off for the whole loop for the same reason), so
 * the gizmo switches it off around its own draw and puts it back afterwards.
 *
 * The axes are three's frame: the game mirrors X and Y, so a label flip is a later decision, not a bug of
 * the gizmo.
 */
export interface OrientationGizmo {
  /**
   * Draws the triad over the frame the renderer has just drawn.
   *
   * @param renderer The renderer of the view.
   */
  readonly render: (renderer: WebGLRenderer) => void
  /**
   * Frees the geometries, the materials and the label textures of the triad.
   */
  readonly dispose: () => void
}

/**
 * Builds the orientation compass of a canvas.
 *
 * @param canvas The canvas of the view: the helper measures it to place the triad.
 * @param camera The camera whose orientation the triad shows.
 *
 * @returns The gizmo the render loop drives.
 */
export function createOrientationGizmo(canvas: HTMLCanvasElement, camera: PerspectiveCamera): OrientationGizmo {
  const helper = new ViewHelper(camera, canvas)

  return {
    render: (renderer): void => {
      // three clears the colour buffer before every `render()`: the level would disappear under the triad
      const { autoClear } = renderer

      renderer.autoClear = false
      helper.render(renderer)
      renderer.autoClear = autoClear
    },
    dispose: (): void => {
      helper.dispose()
    },
  }
}
