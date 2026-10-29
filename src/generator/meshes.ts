import type { ArxPolygon, ArxVector3, ArxFTS } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { BufferAttribute, BufferGeometry, MeshLambertMaterial, Vector2, Vector3, type Mesh } from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
import { Color } from './Color.ts'

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
 * The polygons the level shows: the ones with an `alpha.bmp` texture container are invisible walls.
 *
 * @remarks
 * `ArxLibertatis` hardcodes `#000` of the `alpha.bmp` as a colour key, so those polygons are not drawn
 * in the game either. The first round drops them, because a flat material would turn them into black
 * walls in the middle of the level; the picking round will need them, and then they get their own
 * invisible group.
 *
 * @param fts The scene of the level.
 *
 * @returns The polygons that should be drawn.
 */
export function visiblePolygons(fts: ArxFTS): ArxPolygon[] {
  const invisible = new Set(
    fts.textureContainers
      .filter((container) => {
        return /alpha/i.test(container.filename)
      })
      .map((container) => {
        return container.id
      }),
  )

  return fts.polygons.filter((polygon) => {
    return !invisible.has(polygon.textureContainerId)
  })
}

/**
 * Builds the geometry of a whole level.
 *
 * @param fts The scene of the level.
 *
 * @returns The geometry of the visible polygons, shifted around the origin.
 */
export function createLevelGeometry(fts: ArxFTS): BufferGeometry {
  const offset = arxVector3toVector3(fts.header.mScenePosition)

  return arxPolygonsToGeometry(visiblePolygons(fts), offset)
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
