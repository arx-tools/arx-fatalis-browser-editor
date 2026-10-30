import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'

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
