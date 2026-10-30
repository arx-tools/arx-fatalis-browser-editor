import type { ArxPolygon, ArxVector3, ArxFTS } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector2,
  Vector3,
  type Mesh,
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
 * The polygons of a level, split by what the renderer has to do with them.
 *
 * @remarks
 * `ArxLibertatis` hardcodes `#000` of the `alpha.bmp` as a colour key, so those polygons are not drawn in the
 * game either: they are the **invisible walls** (they close a stairwell, they stop the player from walking
 * through a doorway). The mesh keeps them, with a material that draws nothing and a mesh that does not cast a
 * shadow, so the level's shape is complete and a selection can still point at them.
 */
export interface LevelPolygons {
  /**
   * The polygons with a real texture.
   */
  readonly solid: readonly ArxPolygon[]
  /**
   * The polygons of an alpha container: the invisible walls.
   */
  readonly invisible: readonly ArxPolygon[]
}

/**
 * Reads the polygons of a level and splits them into the solid ones and the invisible walls.
 *
 * @param fts The scene of the level.
 *
 * @returns The two lists, in the order of the file.
 */
export function splitPolygons(fts: ArxFTS): LevelPolygons {
  const invisibleContainers = new Set(
    fts.textureContainers
      .filter((container) => {
        return /alpha/i.test(container.filename)
      })
      .map((container) => {
        return container.id
      }),
  )

  const solid: ArxPolygon[] = []
  const invisible: ArxPolygon[] = []

  for (const polygon of fts.polygons) {
    if (invisibleContainers.has(polygon.textureContainerId)) {
      invisible.push(polygon)
    } else {
      solid.push(polygon)
    }
  }

  return { solid, invisible }
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
 */
export function accelerateRaycast(mesh: Mesh): void {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry)
  mesh.raycast = acceleratedRaycast
}

/**
 * Builds the material of the level mesh.
 *
 * @remarks
 * The first round has no textures, so the whole level shares one flat material. The texture round
 * replaces this with one material per texture container.
 *
 * @returns The material the mesh of the level is drawn with.
 */
export function createLevelMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({ color: MESH_COLOR.getHex() })
}

/**
 * Builds the material of the invisible walls of the level.
 *
 * @remarks
 * It draws nothing: the polygons are there for the shape of the level (a wall the player can not walk
 * through), not for its look. The depth is not written either, because a surface that draws nothing must not
 * hide what stands behind it; the mesh that carries this material does not cast a shadow for the same reason.
 *
 * @returns The material of the alpha polygons.
 */
export function createInvisibleMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
}

/**
 * The colour of the wireframe.
 *
 * @remarks
 * The flat grey of the mesh, darkened by half: the lines then read on it, and the look is the one the
 * archived editor had (`createPolygonWireframe` in `src/_old/`).
 */
const WIREFRAME_COLOR = Color.white.darken(50)

/**
 * Builds the material of a wireframe.
 *
 * @remarks
 * A new instance per view: the level meshes share their geometry, and the wireframe is a `LineSegments`
 * wrapper like them, but a disposed wrapper takes its material with it.
 *
 * @returns The material of the wireframe lines.
 */
export function createWireframeMaterial(): LineBasicMaterial {
  return new LineBasicMaterial({ color: WIREFRAME_COLOR.getHex() })
}

/**
 * Builds the wireframe of a set of Arx polygons.
 *
 * @remarks
 * The **perimeter of every source polygon** instead of the triangles of the merged geometry: this keeps
 * the quad edges visible without the diagonal the triangle split introduces, so the wireframe shows the
 * polygons the level stores (the archived editor did the same in `src/_old/geometry/createWireframe.ts`).
 *
 * The perimeter follows {@link polygonPerimeter} (`0-1-2` for a triangle, `0-1-3-2` for a quad), and
 * the segments go into the geometry as pairs of points, which is what a `LineSegments` reads.
 *
 * @param polygons The polygons to convert.
 * @param offset The scene position of the level, already mirrored.
 *
 * @returns The segments, ready for a `LineSegments`.
 */
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
