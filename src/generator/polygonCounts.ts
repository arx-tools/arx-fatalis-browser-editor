import type { ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'

/**
 * How many triangles and quads a list of polygons holds.
 */
export interface PolygonCounts {
  /**
   * The polygons without the quad flag.
   */
  readonly triangleCount: number
  /**
   * The polygons with the quad flag.
   */
  readonly quadCount: number
}

/**
 * Counts the triangles and the quads of a level.
 *
 * @remarks
 * The game stores both in the same list: a polygon is a quad when its `Quad` flag is set (four vertices),
 * otherwise it is a triangle. The geometry builder splits the quads into two triangles, so this count is
 * the one the file has, not the one the renderer draws.
 *
 * @param polygons The polygons of the scene.
 *
 * @returns The number of triangles and quads.
 */
export function countPolygonShapes(polygons: readonly ArxPolygon[]): PolygonCounts {
  let quadCount = 0

  for (const polygon of polygons) {
    if (isQuad(polygon)) {
      quadCount = quadCount + 1
    }
  }

  return { triangleCount: polygons.length - quadCount, quadCount }
}
