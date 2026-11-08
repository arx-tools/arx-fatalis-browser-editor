import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  MeshLambertMaterial,
  Vector2,
  Vector3,
  type Mesh,
  type Side,
} from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { Color } from './Color.ts'
import { polygonPerimeter } from './polygons.ts'

/**
 * The colour of the flat material of the first round.
 *
 * @remarks
 * The mesh has no textures and the level has no baked lighting yet, so a plain, slightly warm grey
 * shows the shape of the level without pretending to be the game's look. The value comes from the
 * shared {@link Color} class, the same one the lighting round will read the palette with.
 */
const MESH_COLOR = Color.fromCSS('#b8b2a8')

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
 * The first round has no textures, so the whole level shares one flat material. The texture round
 * replaces this with one material per texture container.
 *
 * @param options How the material draws; the two sides of a face are the default (`FrontSide`).
 *
 * @returns The material the mesh of the level is drawn with.
 */
export function createLevelMaterial(options: LevelMaterialOptions = {}): MeshLambertMaterial {
  const material = new MeshLambertMaterial({ color: MESH_COLOR.getHex() })

  if (options.side !== undefined) {
    material.side = options.side
  }

  return material
}

/**
 * The colour of the wireframe: a neutral grey.
 *
 * @remarks
 * A plain `#777` (2026-11-08, the owner): it reads over the black of a hidden mesh and over the textures of a shown one
 * alike, and it is quiet on the dark faces (a lighter grey shouted over them). The owner tried `#ccc` (too bright), `#aaa`
 * (still loud on the dark) and the complement of the surface under the line (it disappears on the mid tones, which reads
 * as a broken outline), and kept this one.
 */
const WIREFRAME_OVER_BLACK = 0x77_77_77

/**
 * Builds the material of a wireframe.
 *
 * @remarks
 * A new instance per view: the level meshes share their geometry, and the wireframe is a `LineSegments` wrapper like
 * them, but a disposed wrapper takes its material with it.
 *
 * @returns The material of the wireframe lines.
 */
export function createWireframeMaterial(): LineBasicMaterial {
  // `transparent` is not about the alpha (the line is opaque): three draws the transparent objects after the opaque
  // ones, which is what puts these lines over the translucent fill of the selection, and over the mesh
  return new LineBasicMaterial({ color: WIREFRAME_OVER_BLACK, transparent: true })
}

export function arxPolygonsToWireframeGeometry(polygons: readonly ArxPolygon[], offset: Vector3): BufferGeometry {
  const positions: number[] = []

  for (const polygon of polygons) {
    const vertices = polygon.vertices.map((vertex) => {
      return arxVector3toVector3(vertex).sub(offset)
    })
    const perimeter = polygonPerimeter(polygon)

    for (let index = 0; index < perimeter.length; index++) {
      const from = vertices[perimeter[index]]
      const to = vertices[perimeter[(index + 1) % perimeter.length]]

      positions.push(from.x, from.y, from.z, to.x, to.y, to.z)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))

  return geometry
}
