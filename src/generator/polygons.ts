import { ArxPolygonFlags, type ArxPolygon, type ArxVertex, type ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { arxVector3toVector3 } from './meshes.ts'

/**
 * Tells whether a face is drawn from both sides.
 *
 * @remarks
 * The FTS marks the polygons a level has to draw from behind (a fence, a door, a banner, a hanging cloth) with the
 * `DoubleSided` bit, and the game draws those faces with both sides lit. The renderer can only draw a face from both
 * sides through the `side` of its material, which is why the paint builds a material of each kind for a texture that
 * has such a face (see `levelTextures`).
 *
 * @param polygon The polygon to read.
 *
 * @returns True when the game draws it from both sides.
 */
export function isDoubleSided(polygon: Pick<ArxPolygon, 'flags'>): boolean {
  return (polygon.flags & ArxPolygonFlags.DoubleSided) !== 0
}

/**
 * How the game blends a face with what is behind it.
 *
 * @remarks
 * The `Transparent` bit of a face says it is blended at all, and its **`transval`** says how:
 *
 * - `2` or more: multiplicative (the face darkens/multiplies what is behind it);
 * - `1` or more: additive (a light ray, a glow — black adds nothing, so it is invisible);
 * - above `0`: the normal alpha blend of the game (the texture's own alpha, from its colour key, cuts the face);
 * - `0` or less: **subtractive** — the game draws `dst * (1 - src)`, so a flame darkens the wall instead of covering
 * it with the black of its background.
 *
 * @see https://github.com/arx/ArxLibertatis/blob/1.2.1/src/graphics/data/Mesh.cpp (the `POLY_TRANS` branch of
 * `ComputePortalVertexBuffer`)
 */
export type PolygonBlendMode = 'opaque' | 'alpha' | 'additive' | 'multiplicative' | 'subtractive'

/**
 * The blend modes, in the order the editor keys the groups of the geometry with.
 */
export const POLYGON_BLEND_MODES: readonly PolygonBlendMode[] = [
  'opaque',
  'alpha',
  'additive',
  'multiplicative',
  'subtractive',
]

/**
 * How the game blends a face.
 *
 * @param polygon The polygon to read.
 *
 * @returns The blend mode of the game; `opaque` for a face without the `Transparent` bit.
 */
export function blendModeOf(polygon: Pick<ArxPolygon, 'flags' | 'transval'>): PolygonBlendMode {
  if ((polygon.flags & ArxPolygonFlags.Transparent) === 0) {
    return 'opaque'
  }

  if (polygon.transval >= 2) {
    return 'multiplicative'
  }

  if (polygon.transval >= 1) {
    return 'additive'
  }

  if (polygon.transval > 0) {
    return 'alpha'
  }

  return 'subtractive'
}

/**
 * The brightness the game multiplies the texture of a blended face with.
 *
 * @remarks
 * The game sets every vertex colour of a `Transparent` face to `gray(trans)` before it draws them, which is why a light
 * ray is dim and a torch flame is not: the values are the ones of `ComputePortalVertexBuffer`.
 *
 * @param polygon The polygon to read.
 *
 * @returns The grey of the face, `1` for an opaque one.
 */
export function blendTransOf(polygon: Pick<ArxPolygon, 'flags' | 'transval'>): number {
  const mode = blendModeOf(polygon)

  if (mode === 'opaque') {
    return 1
  }

  if (mode === 'multiplicative') {
    const half = polygon.transval * 0.5

    return half + 0.5
  }

  if (mode === 'additive') {
    return polygon.transval - 1
  }

  return 1 - polygon.transval
}

/**
 * The stored vertex order of a polygon is a "Z": `0, 1, 2` for a triangle and `0, 1, 2, 3` for a quad.
 *
 * @remarks
 * The perimeter walks the source polygon, so a quad keeps its four edges without the diagonal the
 * triangle split introduces: the same rule the wireframe and the selection outline follow.
 *
 * @param polygon The polygon to walk.
 *
 * @returns The vertex indices of the perimeter, in order.
 */
export function polygonPerimeter(polygon: ArxPolygon): readonly number[] {
  if (isQuad(polygon)) {
    return [0, 1, 3, 2]
  }

  return [0, 1, 2]
}

/**
 * The triangles of the merged geometry, as vertex index triplets of the source polygon.
 *
 * @remarks
 * A quad is split along `b-c` (`a, b, c` and `c, b, d`), which is the order `arxPolygonsToGeometry`
 * builds: the fill of a selected polygon has to cover exactly the same triangles.
 *
 * @param polygon The polygon to split.
 *
 * @returns The triangles, one for a triangle polygon and two for a quad.
 */
export function polygonFillTriangles(polygon: ArxPolygon): ReadonlyArray<readonly [number, number, number]> {
  if (isQuad(polygon)) {
    return [
      [0, 1, 2],
      [2, 1, 3],
    ]
  }

  return [[0, 1, 2]]
}

/**
 * Maps a triangle of the merged geometry to the polygon it was built from.
 *
 * @remarks
 * The geometry of the level is built from the visible polygons in their own order, so the triangles of
 * one polygon follow each other: the map is the running total of the triangles, one entry per triangle.
 * A raycast reports the triangle it hit, and this is what turns that into a polygon index.
 *
 * @param polygons The polygons the geometry was built from, in that order.
 *
 * @returns The polygon index of every triangle, in the order of the geometry.
 */
export function triangleToPolygonMap(polygons: readonly ArxPolygon[]): number[] {
  const map: number[] = []

  for (const [index, polygon] of polygons.entries()) {
    const triangles = polygonFillTriangles(polygon).length

    for (let triangle = 0; triangle < triangles; triangle++) {
      map.push(index)
    }
  }

  return map
}

/**
 * Reads the polygon a raycast hit.
 *
 * @param map The triangle map of the level.
 * @param triangleIndex The triangle the raycast reported (`faceIndex`).
 *
 * @returns The polygon index, or `undefined` when the triangle is not in the map.
 */
export function polygonOfTriangle(map: readonly number[], triangleIndex: number): number | undefined {
  return map[triangleIndex]
}

/**
 * The vertices a polygon actually uses: three for a triangle, four for a quad.
 *
 * @remarks
 * The stored polygon always has four vertex slots, and the fourth one of a triangle is the leftover of the
 * quad layout — counting it as a vertex would weld triangles to faces they do not touch.
 *
 * @param polygon The polygon to read.
 *
 * @returns The vertices it draws.
 */
export function usedVerticesOf(polygon: ArxPolygon): ArxVertex[] {
  if (isQuad(polygon)) {
    return polygon.vertices.slice(0, 4)
  }

  return polygon.vertices.slice(0, 3)
}

/**
 * The precision of the key of a vertex position, in decimals: a tenth of a unit.
 *
 * @remarks
 * The level 0 floor is a single surface the author put together from two pieces, and the pieces sit at heights that
 * differ by **0.003** (measured: `y` 1780.7126 and 1780.7159 on the two sides of the seam). A key of two decimals puts
 * those in **two** buckets — 1780.71 and 1780.72 — so the double click selected one half of the floor (110 faces) and
 * the other half was a separate area (122), while the player sees one floor. One decimal welds them (232), and it is far
 * below the 100-unit cell of the level, so two faces that are genuinely apart do not meet.
 */
const VERTEX_KEY_DECIMALS = 1

/**
 * The key of a vertex position: the rounded coordinates, so two polygons that meet at the same point find
 * each other even when the file stored the point with a rounding difference.
 *
 * @param vertex The vertex to key.
 *
 * @returns The key of its position.
 */
export function vertexKeyOf(vertex: ArxVector3): string {
  return `${vertex.x.toFixed(VERTEX_KEY_DECIMALS)}:${vertex.y.toFixed(VERTEX_KEY_DECIMALS)}:${vertex.z.toFixed(VERTEX_KEY_DECIMALS)}`
}

/**
 * Groups the polygons by the positions of their vertices.
 *
 * @remarks
 * Two polygons that share a vertex are neighbours: this is the rule the dragged selection and the texture
 * fill follow, so both walk the welds of the mesh and stop where the mesh is not welded.
 *
 * @param polygons The polygons of the level, in their own order.
 *
 * @returns The index of polygons for every vertex position.
 */
export function vertexToPolygonsMap(polygons: readonly ArxPolygon[]): Map<string, number[]> {
  const index = new Map<string, number[]>()

  for (const [polygonIndex, polygon] of polygons.entries()) {
    for (const vertex of usedVerticesOf(polygon)) {
      const key = vertexKeyOf(vertex)
      const list = index.get(key)

      if (list === undefined) {
        index.set(key, [polygonIndex])
      } else {
        list.push(polygonIndex)
      }
    }
  }

  return index
}

/**
 * The polygons that touch the given point, closer than a small distance.
 *
 * @param polygon The polygon to test.
 * @param vertices The vertices of the polygons selected so far in the gesture.
 * @param distance How close two vertices have to be, in the units of the level.
 *
 * @returns Whether one of the polygon's vertices is that close to one of the given ones.
 */
export function isTouchingVertices(polygon: ArxPolygon, vertices: readonly ArxVector3[], distance = 0.25): boolean {
  if (vertices.length === 0) {
    return true
  }

  const reach = distance * distance

  for (const vertex of usedVerticesOf(polygon)) {
    const point = arxVector3toVector3(vertex)

    for (const other of vertices) {
      if (point.distanceToSquared(arxVector3toVector3(other)) <= reach) {
        return true
      }
    }
  }

  return false
}

/**
 * The connected polygons that use the same texture as the start polygon.
 *
 * @remarks
 * A double click takes the whole welded area of one texture, however big it is: the biggest connected
 * same texture area of the original levels is around 1800 polygons, so the walk is cheap and a limit would
 * only look like a broken selection. The walk stops where the mesh is not welded, so it never jumps over a
 * gap to a face that only touches in space.
 *
 * @param polygons The polygons of the level, in their own order.
 * @param vertexToPolygons The vertex index of {@link vertexToPolygonsMap}.
 * @param startPolygon The polygon the click landed on.
 *
 * @returns The indices of the polygons of the area, the start one included.
 */
export function sameTextureAreaOf(
  polygons: readonly ArxPolygon[],
  vertexToPolygons: ReadonlyMap<string, readonly number[]>,
  startPolygon: number,
): number[] {
  const start = polygons[startPolygon]

  if (start === undefined) {
    return []
  }

  const area: number[] = []
  const visited = new Set<number>([startPolygon])
  const queue = [startPolygon]

  while (queue.length > 0) {
    const polygonIndex = queue.pop()

    if (polygonIndex === undefined) {
      break
    }

    const polygon = polygons[polygonIndex]

    if (polygon === undefined) {
      continue
    }

    area.push(polygonIndex)

    for (const vertex of usedVerticesOf(polygon)) {
      for (const neighbour of vertexToPolygons.get(vertexKeyOf(vertex)) ?? []) {
        if (visited.has(neighbour)) {
          continue
        }

        if (polygons[neighbour]?.textureContainerId !== start.textureContainerId) {
          continue
        }

        visited.add(neighbour)
        queue.push(neighbour)
      }
    }
  }

  return area
}
