import type { ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * A key that tells two places apart, without the cost of a float string.
 *
 * @param position The place in the coordinates of the level.
 *
 * @returns The key of the place, at a tenth of a unit.
 */
export function placeKeyOf(position: ArxVector3): string {
  return `${String(Math.round(position.x * 10))},${String(Math.round(position.y * 10))},${String(Math.round(position.z * 10))}`
}

/**
 * Reads the corners of the selected faces, without the repeats.
 *
 * @remarks
 * The snaps of a drag all start from a corner of the selection: the vertex snap and the plane snap both look for a
 * target near one of them, so the list is read the same way in both. Two faces of a selection share a corner, and the
 * list holds it once.
 *
 * @param map The level of the selection.
 * @param faces The indices of the selected faces.
 *
 * @returns The positions of the corners, in the coordinates of the level.
 */
export function selectionCornersOf(map: ArxMap, faces: Iterable<number>): ArxVector3[] {
  const corners: ArxVector3[] = []
  const seen = new Set<string>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    let count = 3

    if (isQuad(polygon)) {
      count = 4
    }

    for (let vertex = 0; vertex < count; vertex = vertex + 1) {
      const source = polygon.vertices[vertex]

      if (source === undefined) {
        continue
      }

      const position = { x: source.x, y: source.y, z: source.z }
      const key = placeKeyOf(position)

      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      corners.push(position)
    }
  }

  return corners
}
