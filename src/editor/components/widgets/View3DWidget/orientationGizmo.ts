import {
  CanvasTexture,
  PerspectiveCamera,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js'

/**
 * The size of the square the triad is drawn in, in pixels.
 *
 * @remarks
 * It is the `ViewHelper`'s own constant (128), and the canvas of the gizmo is exactly this size, so the
 * helper's viewport math ends up covering the whole canvas.
 */
export const GIZMO_SIZE = 128

/**
 * The opacity of the white dot of a negative axis.
 *
 * @remarks
 * The helper draws its negative axes as black circles at 20% opacity, which disappear on the dark
 * background of the empty space. White at a quarter is visible on the dark disc and on the light level
 * alike.
 */
const NEGATIVE_DOT_OPACITY = 0.25

/**
 * The turn between the frame of the scene and the frame of the game.
 *
 * @remarks
 * The level is built with `M(x, y, z) = (-x, -y, z)` (see `arxVector3toVector3`), which is a 180° turn
 * around Z and not a mirror: it keeps the terrain upright while it puts the game's axes on the other side.
 * The gizmo shows the **game's** frame — the one the readout and the url speak — so the triad is turned by
 * this before the helper looks at it.
 */
const GAME_TURN = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI)

/**
 * The orientation compass in the corner of the walkable view.
 *
 * @remarks
 * It is three's own `ViewHelper` (the one the old app drew at the end of its render loop): a small axis
 * triad that turns with the camera, so the orientation of the view is readable at a glance.
 *
 * - **The gizmo has a canvas of its own** (128×128, over the corner of the view), so it never touches the
 * render of the level: the old app had to turn the renderer's auto clear off, because the helper's
 * `render()` wipes the frame it draws onto.
 * - **The axes are the game's**: `arx-convert` describes the frame as X pointing left, Y pointing down and Z
 * coming out of the screen (`node_modules/arx-convert/README.md`). The scene is built with X and Y negated,
 * so the triad gets the {@link GAME_TURN} turn to point where the game and the coordinate readout say.
 * - The negative axes keep their place but their black dots are repainted white and faint, otherwise
 * they vanish in the dark.
 */
export interface OrientationGizmo {
  /**
   * Draws the triad, which follows the camera.
   */
  readonly render: () => void
  /**
   * Frees the geometries, the materials and the textures of the triad, and the renderer.
   */
  readonly dispose: () => void
}

/**
 * Builds a sprite material with a plain, light circle: the three negative axes of the helper.
 *
 * @returns The material of the dots, with its own texture.
 */
function createNegativeDotMaterial(): SpriteMaterial {
  const canvas = document.createElement('canvas')

  canvas.width = 64
  canvas.height = 64

  const context = canvas.getContext('2d')

  if (context !== null) {
    context.beginPath()
    context.arc(32, 32, 14, 0, 2 * Math.PI)
    context.closePath()
    context.fillStyle = '#ffffff'
    context.fill()
  }

  const texture = new CanvasTexture(canvas)

  texture.colorSpace = SRGBColorSpace

  return new SpriteMaterial({ map: texture, transparent: true, opacity: NEGATIVE_DOT_OPACITY, toneMapped: false })
}

/**
 * Repaints the dots of the negative axes of the helper.
 *
 * @remarks
 * The helper keeps those three sprites in its `children`, at a position with a negative coordinate; the
 * three of them share one material, so the old one is disposed once.
 *
 * @param helper The helper to repaint.
 * @param dotMaterial The material of the new dots.
 */
function lightenNegativeDots(helper: ViewHelper, dotMaterial: SpriteMaterial): void {
  const replaced = new Set<SpriteMaterial>()

  for (const child of helper.children) {
    if (!(child instanceof Sprite)) {
      continue
    }

    const isNegative = child.position.x < 0 || child.position.y < 0 || child.position.z < 0

    if (!isNegative) {
      continue
    }

    replaced.add(child.material)
    child.material = dotMaterial
  }

  for (const material of replaced) {
    material.map?.dispose()
    material.dispose()
  }
}

/**
 * Builds the orientation compass of a canvas.
 *
 * @param canvas The canvas of the gizmo: the helper measures it to place the triad.
 * @param camera The camera whose orientation the triad shows.
 *
 * @returns The gizmo the render loop drives.
 */
export function createOrientationGizmo(canvas: HTMLCanvasElement, camera: PerspectiveCamera): OrientationGizmo {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true })
  // the helper asks its camera for the orientation; this one stands in for the editor's camera, in the
  // frame of the game
  const followed = new PerspectiveCamera()

  renderer.setPixelRatio(globalThis.devicePixelRatio)
  renderer.setSize(GIZMO_SIZE, GIZMO_SIZE, false)
  renderer.setClearColor(0, 0)

  const helper = new ViewHelper(followed, canvas)
  const dotMaterial = createNegativeDotMaterial()

  lightenNegativeDots(helper, dotMaterial)

  return {
    render: (): void => {
      followed.quaternion.copy(GAME_TURN).multiply(camera.quaternion)
      renderer.clear()
      helper.render(renderer)
    },
    dispose: (): void => {
      helper.dispose()
      dotMaterial.map?.dispose()
      dotMaterial.dispose()
      renderer.dispose()
    },
  }
}
