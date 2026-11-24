import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import {
  type Vector3,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  ShaderMaterial,
  Color as ThreeColor,
} from 'three'
import { isDoubleSided, polygonPerimeter } from '../polygons.ts'
import { arxVector3toVector3 } from './conversion.ts'

/**
 * The color of the plain wireframe of the fixed views: a neutral gray.
 *
 * @remarks
 * A plain `#777` (2026-11-08, the owner): it reads over the black of a hidden mesh and over the textures of a shown one
 * alike, and it is quiet on the dark faces (a lighter gray shouted over them). The owner tried `#ccc` (too bright), `#aaa`
 * (still loud on the dark) and the complement of the surface under the line (it disappears on the mid tones, which reads
 * as a broken outline), and kept this one. The fixed views draw their level with the light preview material, so the gray
 * stays here.
 */
const WIREFRAME_OVER_BLACK = 0x77_77_77

/**
 * The color of the plain wireframe of the walkable view, while the mesh is off.
 *
 * @remarks
 * A lighter gray than the fixed views' `#777` (2026-11-15, the owner, after the colored wireframe of the textured view):
 * over the black of the hidden mesh the quiet gray read a bit too dark, so the plain line of this view is `#999`.
 */
export const WIREFRAME_WITHOUT_MESH = 0x99_99_99

/**
 * How the material of a wireframe draws.
 */
export type WireframeMaterialOptions = {
  /**
   * The color of the plain gray line, `#777` by default.
   */
  readonly color?: number
}

/**
 * Builds the material of a plain wireframe.
 *
 * @remarks
 * A new instance per view: the level meshes share their geometry, and the wireframe is a `LineSegments` wrapper like
 * them, but a disposed wrapper takes its material with it.
 *
 * @param options How the lines draw; the plain gray of `#777` by default.
 *
 * @returns The material of the wireframe lines.
 */
export function createWireframeMaterial(options: WireframeMaterialOptions = {}): LineBasicMaterial {
  // `transparent` is not about the alpha (the line is opaque): three draws the transparent objects after the opaque
  // ones, which is what puts these lines over the translucent fill of the selection, and over the mesh
  let color = WIREFRAME_OVER_BLACK

  if (options.color !== undefined) {
    color = options.color
  }

  return new LineBasicMaterial({ color, transparent: true })
}

/**
 * The vertex shader of the colored wireframe: the color of the face and the normal it faces the camera with.
 *
 * @remarks
 * The geometry carries the color of every face (see `wireframeColorsOf`) and the normal of the corner of every point
 * (`arxPolygonsToWireframeGeometry`), so the line knows which side of its face the camera sees.
 */
const COLORED_WIREFRAME_VERTEX_SHADER = `
attribute float aDoubleSided;

varying vec3 lineColor;
varying vec3 lineNormal;
varying vec3 linePosition;
varying float twoSided;

void main() {
  lineColor = color;
  lineNormal = normalize(mat3(modelMatrix) * normal);
  linePosition = (modelMatrix * vec4(position, 1.0)).xyz;
  twoSided = aDoubleSided;

  gl_Position = projectionMatrix * viewMatrix * vec4(linePosition, 1.0);
}
`

/**
 * The fragment shader of the colored wireframe: the line of a back face takes the gray of the hidden geometry.
 *
 * @remarks
 * The game culls a face it sees from behind (the texture runs draw the one-sided faces from the front only), so the
 * lines of those faces belong to geometry that is not on the screen: they take the plain gray of the hidden mesh. A
 * face the level draws from both sides (`DoubleSided`) keeps its color, because the level draws it from behind too.
 */
const COLORED_WIREFRAME_FRAGMENT_SHADER = `
uniform vec3 backFaceColor;

varying vec3 lineColor;
varying vec3 lineNormal;
varying vec3 linePosition;
varying float twoSided;

void main() {
  vec3 toCamera = normalize(cameraPosition - linePosition);
  bool backFacing = dot(normalize(lineNormal), toCamera) < 0.0;
  vec3 line = lineColor;

  if (backFacing && twoSided < 0.5) {
    line = backFaceColor;
  }

  gl_FragColor = vec4(line, 1.0);
  #include <colorspace_fragment>
}
`

/**
 * Builds the material of a wireframe that takes the color of its faces.
 *
 * @remarks
 * The lines are drawn from the vertex colors the geometry of the level carries, and a line of a face the camera sees
 * from behind is drawn in the gray of the hidden mesh (`WIREFRAME_WITHOUT_MESH`), so the back of the ceiling reads as
 * the geometry the game culls, not as the texture that is not there.
 *
 * @returns The material of the colored wireframe lines.
 */
export function createColoredWireframeMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: COLORED_WIREFRAME_VERTEX_SHADER,
    fragmentShader: COLORED_WIREFRAME_FRAGMENT_SHADER,
    uniforms: {
      backFaceColor: { value: new ThreeColor(WIREFRAME_WITHOUT_MESH) },
    },
    vertexColors: true,
    transparent: true,
  })
}

/**
 * Reads the color of every vertex of the wireframe, from the color of its polygon.
 *
 * @remarks
 * The wireframe has two vertices per edge of a polygon, and the polygons walk it in the order they are stored in: this
 * is the same walk as {@link arxPolygonsToWireframeGeometry}, so the two buffers stay in step.
 *
 * @param polygons The faces of the level.
 * @param colorOf The color of a face, in the color of the vertices.
 *
 * @returns The colors, in the order of the positions of the wireframe.
 */
export function wireframeColorsOf(
  polygons: readonly ArxPolygon[],
  colorOf: (polygon: ArxPolygon) => readonly [number, number, number],
): Float32Array {
  const values: number[] = []

  for (const polygon of polygons) {
    const [red, green, blue] = colorOf(polygon)
    const vertices = polygonPerimeter(polygon).length * 2

    for (let vertex = 0; vertex < vertices; vertex++) {
      values.push(red, green, blue)
    }
  }

  return new Float32Array(values)
}

/**
 * Builds the wireframe of the level: the perimeter of every polygon, as segments.
 *
 * @remarks
 * A view that colors its lines (a `colorOf` is given) gets the color of the face on every point, and with it the
 * normal of the corner and the two-sided flag of the face: the material needs the two to draw the line of a face the
 * camera sees from behind in the gray of the hidden geometry.
 *
 * @param polygons The faces of the level.
 * @param offset The scene position of the level, already mirrored.
 * @param colorOf The color of a face, in the color of the vertices; without it the geometry has only its points.
 *
 * @returns The geometry of the lines.
 */
/**
 * The index of the points of the wireframe the level draws.
 *
 * @remarks
 * The points of the wireframe are laid out per polygon, two per edge (six for a triangle, eight for a quad). A face a
 * group hides from the view keeps its points in the buffer (the places of the polygons do not move), and this index
 * leaves them out of the lines the views draw.
 *
 * @param polygons The polygons of the level, in the order the wireframe was built with.
 * @param hidden The polygons a group hid from the view.
 *
 * @returns The index of the points to draw.
 */
export function wireframePointIndex(polygons: readonly ArxPolygon[], hidden: ReadonlySet<ArxPolygon>): Uint32Array {
  let total = 0

  for (const polygon of polygons) {
    if (hidden.has(polygon)) {
      continue
    }

    if (isQuad(polygon)) {
      total = total + 8

      continue
    }

    total = total + 6
  }

  const index = new Uint32Array(total)
  let at = 0
  let point = 0

  for (const polygon of polygons) {
    let count = 6

    if (isQuad(polygon)) {
      count = 8
    }

    if (!hidden.has(polygon)) {
      for (let one = 0; one < count; one = one + 1) {
        index[at] = point + one
        at = at + 1
      }
    }

    point = point + count
  }

  return index
}

export function arxPolygonsToWireframeGeometry(
  polygons: readonly ArxPolygon[],
  offset: Vector3,
  colorOf?: (polygon: ArxPolygon) => readonly [number, number, number],
): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const doubleSided: number[] = []

  for (const polygon of polygons) {
    const vertices = polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex).sub(offset)
    })
    const cornerNormals = (polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]).map(
      (normal) => {
        return arxVector3toVector3(normal)
      },
    )
    let twoSided = 0

    if (isDoubleSided(polygon)) {
      twoSided = 1
    }

    const perimeter = polygonPerimeter(polygon)

    for (let index = 0; index < perimeter.length; index++) {
      const fromIndex = perimeter[index]
      const toIndex = perimeter[(index + 1) % perimeter.length]
      const from = vertices[fromIndex]
      const to = vertices[toIndex]

      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)

      if (colorOf !== undefined) {
        const fromNormal = cornerNormals[fromIndex]
        const toNormal = cornerNormals[toIndex]

        normals.push(fromNormal.x, fromNormal.y, fromNormal.z, toNormal.x, toNormal.y, toNormal.z)
        doubleSided.push(twoSided, twoSided)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  if (colorOf !== undefined) {
    geometry.setAttribute('color', new BufferAttribute(wireframeColorsOf(polygons, colorOf), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
    geometry.setAttribute('aDoubleSided', new BufferAttribute(new Float32Array(doubleSided), 1))
  }

  return geometry
}
