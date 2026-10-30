import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { arxVector3toVector3 } from './meshes.ts'

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
export function usedVerticesOf(polygon: ArxPolygon): ArxVector3[] {
  if (isQuad(polygon)) {
    return polygon.vertices.slice(0, 4)
  }

  return polygon.vertices.slice(0, 3)
}

/**
 * The key of a vertex position: the rounded coordinates, so two polygons that meet at the same point find
 * each other even when the file stored the point with a rounding difference.
 *
 * @param vertex The vertex to key.
 *
 * @returns The key of its position.
 */
export function vertexKeyOf(vertex: ArxVector3): string {
  return `${vertex.x.toFixed(2)}:${vertex.y.toFixed(2)}:${vertex.z.toFixed(2)}`
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
