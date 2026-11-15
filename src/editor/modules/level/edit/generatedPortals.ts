import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { generatePortalsOf } from '../../../../generator/portals.ts'

/**
 * The distance two portals may differ in and still count as the same, in game units.
 */
const SIGNATURE_EPSILON = 0.01

/**
 * The maps whose portals this module made.
 *
 * @remarks
 * A flat level may carry portals of its own (a zip, a hand-made level): the first sync of such a level leaves them
 * alone, and only a map this module has made the portals for is rebuilt from the rooms. The set is weak: a map that is
 * not on the screen is not held by it.
 */
const generatedMaps = new WeakSet<ArxMap>()

/**
 * Tells whether the faces of a level lie on one floor.
 *
 * @remarks
 * The generator of this round joins the rooms along the edges their floors share. A wall stands between two rooms of a
 * 3D level, and their floors do not share an edge: the portals of such a level are the openings of the walls, which a
 * later round finds. A level with one vertex off the plane is a 3D level for this check, so the safe answer is `false`.
 *
 * @param map The level to read.
 *
 * @returns True when every vertex of every face has the same Y.
 */
export function isFlatLevel(map: ArxMap): boolean {
  const first = map.polygons[0]?.vertices[0]

  if (first === undefined) {
    return false
  }

  return map.polygons.every((polygon) => {
    return polygon.vertices.every((vertex) => {
      return Math.abs(vertex.y - first.y) <= SIGNATURE_EPSILON
    })
  })
}

/**
 * Builds a signature of a portal, to tell whether a new generation is the same set.
 *
 * @param portal The portal to read.
 *
 * @returns The rooms and the corners of the portal, rounded.
 */
function signatureOf(portal: ArxMap['fts']['portals'][number]): string {
  const corners = portal.polygon.vertices.map((vertex) => {
    return [vertex.position.x, vertex.position.y, vertex.position.z]
      .map((value) => {
        return Math.round(value / SIGNATURE_EPSILON)
      })
      .join(',')
  })

  return `${String(portal.room1)}:${String(portal.room2)}:${corners.join(';')}`
}

/**
 * Tells whether two sets of portals are the same.
 *
 * @param current The portals of the map.
 * @param next The portals a generation made.
 *
 * @returns True when the rooms and the corners are the same.
 */
function areSamePortals(current: ArxMap['fts']['portals'], next: ArxMap['fts']['portals']): boolean {
  if (current.length !== next.length) {
    return false
  }

  const signatures = new Set(
    current.map((portal) => {
      return signatureOf(portal)
    }),
  )

  return next.every((portal) => {
    return signatures.has(signatureOf(portal))
  })
}

/**
 * Rebuilds the portals of a flat level from the rooms of its faces.
 *
 * @remarks
 * It is the **automatic** half of the portal feature: the rooms of a flat level are the input, and the portals are
 * derived, so a room edit (create, move, unset) and a replay of the steps rebuild them without a button. The function
 * does nothing on a level that is not flat, and leaves the portals of a flat level it did not make (a zip, a level with
 * its own portals) alone.
 *
 * @param map The level to read and write.
 *
 * @returns True when the portals of the map changed.
 */
export function syncGeneratedPortals(map: ArxMap): boolean {
  if (!isFlatLevel(map)) {
    return false
  }

  const generated = generatePortalsOf(map.polygons)

  if (map.fts.portals.length > 0 && !generatedMaps.has(map)) {
    // a level with portals of its own is the author's, unless they are the ones this generator would make: a level
    // that was exported and opened again carries its generated portals, and the rooms of it may still be edited
    if (!areSamePortals(map.fts.portals, generated)) {
      return false
    }

    generatedMaps.add(map)

    return false
  }

  generatedMaps.add(map)

  if (areSamePortals(map.fts.portals, generated)) {
    return false
  }

  map.setPortals(generated)

  return true
}
