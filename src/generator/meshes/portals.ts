import type { ArxPortal } from 'arx-convert/types'
import type { Vector3 } from 'three'
import { arxVector3toVector3 } from './conversion.ts'

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
