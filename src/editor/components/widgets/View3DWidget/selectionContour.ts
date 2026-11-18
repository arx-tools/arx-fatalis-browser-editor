import type { ArxPolygon } from 'arx-convert/types'
import {
  BufferGeometry,
  Color as ThreeColor,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Vector3,
  type WebGLRenderer,
} from 'three'
import type { SelectionMode } from '../../../modules/selection/selectionStore.ts'
import { polygonFillGeometry } from './polygonSelection.ts'

/**
 * The contour of the faces the crosshair is on, drawn in the frame of the canvas.
 *
 * @remarks
 * The outline of a set of faces is a screen-space question: the edge of the model is not the edge the author sees (a
 * raised face covers the part of it that runs behind), and a line built from the faces shows through what hides it
 * (2026-11-18, the owner: the phantom of a group crossed a fold of the bed). The contour is drawn the way an image is
 * outlined: the faces go into a mask, and a shader puts a line where the mask changes, so the line is the edge of what
 * the camera sees, from any angle.
 *
 * The mask is a render target of the canvas, and the shader is a quad over the scene. Both live here, so the view only
 * has to say which faces to outline, and to draw the contour after the scene.
 */
export type SelectionContour = {
  /**
   * Outlines these faces, or takes the outline away.
   *
   * @param polygons The faces to outline; an empty list takes the contour away.
   * @param mode The mode of the click that is about to happen; it colours the contour.
   */
  readonly set: (polygons: readonly ArxPolygon[], mode: SelectionMode) => void
  /**
   * Draws the contour over the scene of the view.
   *
   * @param camera The camera the scene was drawn with: the mask is a picture of the same view.
   */
  readonly render: (camera: Camera) => void
  /**
   * Frees the target, the geometries and the materials.
   */
  readonly dispose: () => void
}

/**
 * The vertex shader of the contour: a pair of triangles that covers the canvas, with its texture coordinates.
 */
const CONTOUR_VERTEX_SHADER = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * The fragment shader of the contour: a line where the mask changes.
 *
 * @remarks
 * The mask is white where the faces are and black where they are not, and the texture of the target is filtered, so the
 * edge of the mask is a band of a few pixels. The difference of the neighbours is high on that band and zero inside and
 * outside it, which is the line: the author sees the outline of the faces, a few pixels of the picture wide.
 */
const CONTOUR_FRAGMENT_SHADER = `
uniform sampler2D mask;
uniform vec2 texel;
uniform vec3 color;
varying vec2 vUv;

void main() {
  float left = texture2D(mask, vUv - vec2(texel.x, 0.0)).r;
  float right = texture2D(mask, vUv + vec2(texel.x, 0.0)).r;
  float bottom = texture2D(mask, vUv - vec2(0.0, texel.y)).r;
  float top = texture2D(mask, vUv + vec2(0.0, texel.y)).r;
  float edge = abs(left - right) + abs(bottom - top);
  float alpha = smoothstep(0.05, 0.3, edge);

  gl_FragColor = vec4(color, alpha);
}
`

/**
 * The colour of the contour of a mode.
 *
 * @param mode The mode of the click that is about to happen: green adds, red takes away.
 *
 * @returns The colour, as three numbers of red, green and blue.
 */
function colourOf(mode: SelectionMode): readonly [number, number, number] {
  if (mode === 'remove') {
    return [1, 0, 0]
  }

  return [0, 1, 0]
}

/**
 * Builds the contour of the faces under the crosshair.
 *
 * @param renderer The renderer of the view.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The contour, with nothing outlined yet.
 */
export function createSelectionContour(renderer: WebGLRenderer, offset: Vector3): SelectionContour {
  const target = new WebGLRenderTarget(1, 1, { depthBuffer: true })
  const maskScene = new Scene()

  // the mask is white on black: the contour shader only reads where the faces are
  maskScene.background = new ThreeColor(0x00_00_00)

  const maskMaterial = new MeshBasicMaterial({ color: 0xff_ff_ff })
  const mask = new Mesh<BufferGeometry, MeshBasicMaterial>(new PlaneGeometry(1, 1), maskMaterial)

  maskScene.add(mask)

  const material = new ShaderMaterial({
    uniforms: {
      mask: { value: target.texture },
      texel: { value: new Vector2(1, 1) },
      color: { value: new ThreeColor(0, 1, 0) },
    },
    vertexShader: CONTOUR_VERTEX_SHADER,
    fragmentShader: CONTOUR_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
  const screen = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), material)

  quad.frustumCulled = false
  screen.add(quad)

  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let polygons: readonly ArxPolygon[] = []

  /**
   * Follows the size of the canvas: the target and the step of the shader read the same pixels as the scene.
   *
   * @remarks
   * The size is read here and not passed in, so a view does not have to remember the contour when it is resized: the
   * renderer knows the size of the canvas it draws, and the check is a comparison of two numbers.
   */
  function followCanvasSize(): void {
    const size = renderer.getDrawingBufferSize(new Vector2())

    if (target.width === size.x && target.height === size.y) {
      return
    }

    target.setSize(size.x, size.y)
    material.uniforms.texel = { value: new Vector2(1 / size.x, 1 / size.y) }
  }

  return {
    set: (next: readonly ArxPolygon[], mode: SelectionMode): void => {
      polygons = next
      mask.geometry.dispose()

      if (polygons.length === 0) {
        mask.geometry = new BufferGeometry()

        return
      }

      mask.geometry = polygonFillGeometry(polygons, offset)

      const colour = colourOf(mode)
      const uniform = material.uniforms.color as { value: ThreeColor }

      uniform.value.setRGB(colour[0], colour[1], colour[2])
    },
    render: (camera: Camera): void => {
      if (polygons.length === 0) {
        return
      }

      followCanvasSize()

      renderer.setRenderTarget(target)
      renderer.render(maskScene, camera)
      renderer.setRenderTarget(null)

      // the contour is painted over the scene that is already on the canvas
      const previousAutoClear = renderer.autoClear

      renderer.autoClear = false
      renderer.render(screen, screenCamera)
      renderer.autoClear = previousAutoClear
    },
    dispose: (): void => {
      target.dispose()
      mask.geometry.dispose()
      maskMaterial.dispose()
      quad.geometry.dispose()
      material.dispose()
    },
  }
}
