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
   * @param mode The mode of the click that is about to happen; it colors the contour.
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
 * edge of the mask is a band of a few pixels. The difference of the neighbors is high on that band and zero inside and
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
 * Tells whether two lists of faces are the same list, face by face.
 *
 * @remarks
 * A pick of the crosshair builds the faces of the group it lands on again, in a new array: the mask of the contour is the
 * same picture while the author stands on one group, and building its geometry again is what a hover of a big group pays
 * for (130 446 faces took the view to 5 FPS, 2026-11-26, the owner). The check is the identity of the faces and not a
 * tag of the group: the same faces are the same mask, wherever the list came from.
 *
 * @param one The faces the mask holds.
 * @param other The faces a pick asks for.
 *
 * @returns True when the two lists hold the same faces in the same order.
 */
export function sameFaceListOf(one: readonly ArxPolygon[], other: readonly ArxPolygon[]): boolean {
  if (one.length !== other.length) {
    return false
  }

  for (let index = 0; index < one.length; index = index + 1) {
    if (one[index] !== other[index]) {
      return false
    }
  }

  return true
}

/**
 * The color of the contour of a mode.
 *
 * @param mode The mode of the click that is about to happen: green adds, red takes away.
 *
 * @returns The color, as three numbers of red, green and blue.
 */
function colorOf(mode: SelectionMode): readonly [number, number, number] {
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
   * Whether the mask holds the picture of the faces from the camera it was drawn with.
   */
  let maskDirty = true
  /**
   * The matrices the mask was drawn through: the world and the projection of the camera.
   */
  const maskCamera = new Float32Array(32)
  let maskCameraKnown = false

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
    // the picture of the mask is the size of the canvas: a new size is a new picture
    maskDirty = true
  }

  /**
   * Reads the camera the mask was drawn through.
   *
   * @param camera The camera of the frame.
   */
  function rememberMaskCamera(camera: Camera): void {
    maskCamera.set(camera.matrixWorld.elements, 0)
    maskCamera.set(camera.projectionMatrix.elements, 16)
    maskCameraKnown = true
  }

  /**
   * Tells whether the camera of the frame sees the mask from another place than the one it was drawn from.
   *
   * @param camera The camera of the frame.
   *
   * @returns True when the mask has to be drawn again.
   */
  function maskCameraMoved(camera: Camera): boolean {
    if (!maskCameraKnown) {
      return true
    }

    const world = camera.matrixWorld.elements
    const projection = camera.projectionMatrix.elements

    for (let index = 0; index < 16; index = index + 1) {
      if (maskCamera[index] !== world[index] || maskCamera[index + 16] !== projection[index]) {
        return true
      }
    }

    return false
  }

  return {
    set: (next: readonly ArxPolygon[], mode: SelectionMode): void => {
      // the color of the contour is read on every ask: the same faces under a remove are red, and the mask is the same
      const color = colorOf(mode)
      const uniform = material.uniforms.color as { value: ThreeColor }

      uniform.value.setRGB(color[0], color[1], color[2])

      // the same faces are the same mask: a pick that lands on the same group keeps the geometry it built (2026-11-26,
      // the owner: the hover of a big group took the view to 5 FPS)
      if (sameFaceListOf(polygons, next)) {
        return
      }

      polygons = next
      maskDirty = true
      mask.geometry.dispose()

      if (polygons.length === 0) {
        mask.geometry = new BufferGeometry()

        return
      }

      mask.geometry = polygonFillGeometry(polygons, offset)
    },
    render: (camera: Camera): void => {
      if (polygons.length === 0) {
        return
      }

      followCanvasSize()

      // the mask is a picture of the faces from the camera: it is drawn again only when one of them moved (2026-11-26,
      // the owner: the mask was drawn on every frame of a still camera too)
      if (maskDirty || maskCameraMoved(camera)) {
        renderer.setRenderTarget(target)
        renderer.render(maskScene, camera)
        renderer.setRenderTarget(null)

        maskDirty = false
        rememberMaskCamera(camera)
      }

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
