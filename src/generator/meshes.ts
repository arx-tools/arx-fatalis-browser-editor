import type { ArxPolygon, ArxPortal, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import {
  BufferAttribute,
  BufferGeometry,
  Color as ThreeColor,
  LineBasicMaterial,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Mesh,
  type Side,
} from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { isDoubleSided, polygonPerimeter } from './polygons.ts'

/**
 * Mirrors one game position into the three.js space.
 *
 * @remarks
 * The game's coordinate system is mirrored on the X and Y axes compared to three.js, so every point of
 * the mesh goes through `M(x, y, z) = (-x, -y, z)`. The level is also shifted by its scene position, so
 * the widget does not have to deal with the large absolute coordinates of the game.
 *
 * @param vector The point in the game's coordinate system.
 *
 * @returns The same point in the three.js space.
 */
export function arxVector3toVector3(vector: ArxVector3): Vector3 {
  return new Vector3(-vector.x, -vector.y, vector.z)
}

/**
 * A slice of a buffer, counted in vertices.
 */
export interface VertexRun {
  /**
   * Where the slice starts, in vertices.
   */
  readonly from: number
  /**
   * How many vertices it holds.
   */
  readonly count: number
}

/**
 * A slice of a buffer, with the buffer it comes from.
 */
export interface VertexSegment extends VertexRun {
  /**
   * The buffer to read.
   */
  readonly source: Float32Array
}

/**
 * The runs of a buffer that stay when some of its polygons go.
 *
 * @remarks
 * A level is edited by taking polygons out, and the geometry of a mesh is a flat list of the vertices of its
 * polygons: a polygon owns `3` vertices (a triangle), `6` (a quad) or, in the wireframe, `6`/`8` (two vertices per
 * edge of the perimeter). The kept polygons are therefore a few **runs** of the buffer — a delete takes a few out,
 * so the most of it is one or two runs, and copying them is a handful of `set` calls instead of one per polygon.
 *
 * The kept polygons **keep their order**, so a triangle stays at the same place divided by three: that is what the
 * pick reads (`face.a / 3`) and what the triangle map is built on.
 *
 * @param counts How many vertices every polygon of the buffer owns, in the order of the buffer.
 * @param kept Which of the polygons stay, in the same order.
 *
 * @returns The runs to copy, in the order of the buffer.
 */
export function keptRuns(counts: readonly number[], kept: readonly boolean[]): VertexRun[] {
  const runs: VertexRun[] = []
  let from = 0
  let runFrom = 0
  let runCount = 0

  for (const [index, count] of counts.entries()) {
    if (kept[index]) {
      if (runCount === 0) {
        runFrom = from
      }

      runCount = runCount + count
    } else if (runCount > 0) {
      runs.push({ from: runFrom, count: runCount })
      runCount = 0
    }

    from = from + count
  }

  if (runCount > 0) {
    runs.push({ from: runFrom, count: runCount })
  }

  return runs
}

/**
 * Copies slices of buffers into one buffer.
 *
 * @remarks
 * It is the write side of {@link keptRuns} — and of an undo: a step that puts polygons back takes the kept runs from
 * the live geometry and the polygons themselves from a geometry built for them, and the two are interleaved by the
 * order of the segments.
 *
 * @param segments The slices to copy, in the order they go into the new buffer.
 * @param itemSize How many numbers one vertex holds (3 for the position, 2 for the uv).
 *
 * @returns The new buffer.
 */
export function copyVertexSegments(segments: readonly VertexSegment[], itemSize: number): Float32Array {
  let vertexCount = 0

  for (const segment of segments) {
    vertexCount = vertexCount + segment.count
  }

  const target = new Float32Array(vertexCount * itemSize)
  let to = 0

  for (const segment of segments) {
    target.set(
      segment.source.subarray(segment.from * itemSize, (segment.from + segment.count) * itemSize),
      to * itemSize,
    )
    to = to + segment.count
  }

  return target
}

/**
 * Builds the geometry of a set of Arx polygons.
 *
 * @remarks
 * - every polygon becomes one or two triangles: the game stores quads, three.js only knows triangles
 * - the polygon vertices come in the order the game uses, so the quad is split along `a, b, c` and
 * `c, b, d` (the diagonal is `b-c`), which keeps the winding
 * - the UVs and the normals come along, even though the first round draws the mesh without textures and
 * with a flat material: they are what the texture and the lighting round needs, and they cost nothing to
 * build here
 * - the mesh is shifted by the scene position of the level, so it sits around the origin
 *
 * @param polygons The polygons to convert.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The geometry, ready for a `Mesh`.
 */
export function arxPolygonsToGeometry(polygons: readonly ArxPolygon[], offset: Vector3): BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  for (const polygon of polygons) {
    const [a, b, c, d] = polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex).sub(offset).toArray()
    })
    const [uvA, uvB, uvC, uvD] = polygon.vertices.map((vertex) => {
      return new Vector2(vertex.u, vertex.v).toArray()
    })

    // the normals of the four corners: the game gives one normal for the first two corners and another
    // for the last two when the polygon is curved, and the same one four times when it is flat
    const rawNormals = polygon.normals ?? [polygon.norm, polygon.norm, polygon.norm, polygon.norm2]
    const [nA, nB, nC, nD] = rawNormals.map((normal) => {
      return arxVector3toVector3(normal).toArray()
    })

    positions.push(...(a as number[]), ...(b as number[]), ...(c as number[]))
    normals.push(...(nA as number[]), ...(nB as number[]), ...(nC as number[]))
    uvs.push(...uvA, ...uvB, ...uvC)

    if (isQuad(polygon)) {
      positions.push(...(c as number[]), ...(b as number[]), ...(d as number[]))
      normals.push(...(nC as number[]), ...(nB as number[]), ...(nD as number[]))
      uvs.push(...uvC, ...uvB, ...uvD)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))

  return geometry
}

/**
 * How many triangles a leaf of the tree holds.
 *
 * @remarks
 * Measured on level 11 (123 617 triangles, `experiments/browser-editor-delete-cost/`): the tree is what a delete
 * pays for (a cut geometry keeps its triangle order, so the tree is built again), and the default of ten gives
 * **31,5 ms** to build and **5,96 ms** for 200 rays, while forty gives **22,9 ms** and **1,35 ms** — cheaper to
 * build *and* faster to walk. Eighty builds a little faster still (20,5 ms) but walks slower (1,91 ms).
 */
const MAX_LEAF_SIZE = 40

/**
 * How the tree of the picking is built.
 */
export interface RaycastOptions {
  /**
   * Whether the tree leaves the index of the geometry to its caller.
   *
   * @remarks
   * A plain tree **writes the index**: it groups the triangles for its own walk, so a geometry whose index is sorted
   * for the renderer (the level sorts it, one run per texture: see `ArxMap`) would lose that order on the next build,
   * and the draw would fall back to tens of thousands of groups. The indirect tree keeps the triangle ids in a buffer
   * of its own and never touches the index — the renderer's order and the tree's walk can differ.
   */
  readonly indirect?: boolean
}

/**
 * Makes the raycast of a mesh go through a BVH instead of every triangle.
 *
 * @remarks
 * The level is one mesh with tens of thousands of triangles, and every pick (the click of a fixed view) and
 * every lighting ray would test all of them. `three-mesh-bvh` builds the tree once, and
 * {@link acceleratedRaycast} walks that. The tree is built **here**, where the mesh is made, so every
 * consumer gets it without knowing about it: the fixed view picks, and the vertex lighting of the next
 * round rays.
 *
 * The raycast of the mesh is replaced and not the prototype: patching `Mesh.prototype` would touch every
 * three object of the page, and the generator is a library the level projects use as well.
 *
 * @param mesh The mesh to speed up; its geometry has to be built already.
 * @param options How the tree is built; a plain tree by default.
 */
export function accelerateRaycast(mesh: Mesh, options: RaycastOptions = {}): void {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, {
    maxLeafSize: MAX_LEAF_SIZE,
    indirect: options.indirect === true,
  })
  mesh.raycast = acceleratedRaycast
}

/**
 * How the flat material of the level draws.
 */
export interface LevelMaterialOptions {
  /**
   * The side the material draws, `FrontSide` by default.
   */
  readonly side?: Side
}

/**
 * Builds the material of the level mesh.
 *
 * @remarks
 * The material is **unlit**: the light of the level is baked into the palette of the LLF, and the `color` attribute of
 * the geometry carries it (the paint writes it), so the mesh has to show that colour and not the light of the scene.
 * Without a palette the attribute is white, which is the flat look of a level that has no lighting yet.
 *
 * @param options How the material draws; the two sides of a face are the default (`FrontSide`).
 *
 * @returns The material the mesh of the level is drawn with.
 */
export function createLevelMaterial(options: LevelMaterialOptions = {}): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: 0xff_ff_ff, vertexColors: true })

  if (options.side !== undefined) {
    material.side = options.side
  }

  return material
}

/**
 * The colour of the plain wireframe of the fixed views: a neutral grey.
 *
 * @remarks
 * A plain `#777` (2026-11-08, the owner): it reads over the black of a hidden mesh and over the textures of a shown one
 * alike, and it is quiet on the dark faces (a lighter grey shouted over them). The owner tried `#ccc` (too bright), `#aaa`
 * (still loud on the dark) and the complement of the surface under the line (it disappears on the mid tones, which reads
 * as a broken outline), and kept this one. The fixed views draw their level with the light preview material, so the grey
 * stays here.
 */
const WIREFRAME_OVER_BLACK = 0x77_77_77

/**
 * The colour of the plain wireframe of the walkable view, while the mesh is off.
 *
 * @remarks
 * A lighter grey than the fixed views' `#777` (2026-11-15, the owner, after the coloured wireframe of the textured view):
 * over the black of the hidden mesh the quiet grey read a bit too dark, so the plain line of this view is `#999`.
 */
export const WIREFRAME_WITHOUT_MESH = 0x99_99_99

/**
 * How the material of a wireframe draws.
 */
export interface WireframeMaterialOptions {
  /**
   * The colour of the plain grey line, `#777` by default.
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
 * @param options How the lines draw; the plain grey of `#777` by default.
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
 * The vertex shader of the coloured wireframe: the colour of the face and the normal it faces the camera with.
 *
 * @remarks
 * The geometry carries the colour of every face (see `wireframeColorsOf`) and the normal of the corner of every point
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
 * The fragment shader of the coloured wireframe: the line of a back face takes the grey of the hidden geometry.
 *
 * @remarks
 * The game culls a face it sees from behind (the texture runs draw the one-sided faces from the front only), so the
 * lines of those faces belong to geometry that is not on the screen: they take the plain grey of the hidden mesh. A
 * face the level draws from both sides (`DoubleSided`) keeps its colour, because the level draws it from behind too.
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
 * Builds the material of a wireframe that takes the colour of its faces.
 *
 * @remarks
 * The lines are drawn from the vertex colours the geometry of the level carries, and a line of a face the camera sees
 * from behind is drawn in the grey of the hidden mesh (`WIREFRAME_WITHOUT_MESH`), so the back of the ceiling reads as
 * the geometry the game culls, not as the texture that is not there.
 *
 * @returns The material of the coloured wireframe lines.
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
 * Reads the colour of every vertex of the wireframe, from the colour of its polygon.
 *
 * @remarks
 * The wireframe has two vertices per edge of a polygon, and the polygons walk it in the order they are stored in: this
 * is the same walk as {@link arxPolygonsToWireframeGeometry}, so the two buffers stay in step.
 *
 * @param polygons The faces of the level.
 * @param colorOf The colour of a face, in the colour of the vertices.
 *
 * @returns The colours, in the order of the positions of the wireframe.
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
 * A view that colours its lines (a `colorOf` is given) gets the colour of the face on every point, and with it the
 * normal of the corner and the two-sided flag of the face: the material needs the two to draw the line of a face the
 * camera sees from behind in the grey of the hidden geometry.
 *
 * @param polygons The faces of the level.
 * @param offset The scene position of the level, already mirrored.
 * @param colorOf The colour of a face, in the colour of the vertices; without it the geometry has only its points.
 *
 * @returns The geometry of the lines.
 */
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

/**
 * Builds the outline of the portals of a level, as the points of a `LineSegments`.
 *
 * @remarks
 * A portal is a quad, and the game stores its corners in the "Z" order: the perimeter is `0-1-3-2`, so the lines have
 * to walk that order, or the two diagonals of the quad would be drawn across it. The points go through the same mirror
 * and shift as the mesh ({@link arxVector3toVector3}), which puts the outline on the walls of the level.
 *
 * @param portals The portals of the level.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The points of the four edges of every portal, three numbers per point.
 */
export function portalLinePositions(portals: readonly ArxPortal[], offset: Vector3): Float32Array {
  const perimeter = [0, 1, 3, 2]
  const positions: number[] = []

  for (const portal of portals) {
    const corners = portal.polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex.position).sub(offset)
    })

    for (let index = 0; index < perimeter.length; index++) {
      const from = corners[perimeter[index]]
      const to = corners[perimeter[(index + 1) % perimeter.length]]

      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  }

  return new Float32Array(positions)
}
