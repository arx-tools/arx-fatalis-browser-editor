import type { ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * The middle of the box of the corners of the selected faces.
 *
 * @remarks
 * The gizmo of a move stands here. The box is the one of every **corner** of the selection (not the middle of the
 * faces): a room of two walls and a floor puts the gizmo where the three meet, and a single face puts it on its own
 * middle. The coordinates are the ones of the level (the game's), the scene mirrors them at the view.
 *
 * @param map The level to read.
 * @param faces The selected faces, by their index in the level.
 *
 * @returns The middle of their box, or `undefined` when no face of the list is in the level.
 */
export function selectionCenterOf(map: ArxMap, faces: Iterable<number>): ArxVector3 | undefined {
  let found = false
  let minX = 0
  let minY = 0
  let minZ = 0
  let maxX = 0
  let maxY = 0
  let maxZ = 0

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    let corners = 3

    if (isQuad(polygon)) {
      corners = 4
    }

    for (let corner = 0; corner < corners; corner++) {
      const vertex = polygon.vertices[corner]

      if (vertex === undefined) {
        continue
      }

      if (!found) {
        found = true
        minX = vertex.x
        minY = vertex.y
        minZ = vertex.z
        maxX = vertex.x
        maxY = vertex.y
        maxZ = vertex.z

        continue
      }

      minX = Math.min(minX, vertex.x)
      minY = Math.min(minY, vertex.y)
      minZ = Math.min(minZ, vertex.z)
      maxX = Math.max(maxX, vertex.x)
      maxY = Math.max(maxY, vertex.y)
      maxZ = Math.max(maxZ, vertex.z)
    }
  }

  if (!found) {
    return undefined
  }

  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
}
