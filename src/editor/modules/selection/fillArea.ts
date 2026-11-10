import type { ArxPolygon } from 'arx-convert/types'
import { sameTextureAreaOf } from '../../../generator/polygons.ts'
import { roomAreaOf, unassignedAreaOf } from '../../../generator/rooms.ts'

/**
 * What a view shows, which decides what a double click fills the selection with.
 *
 * @remarks
 * The room map switch of the view decides it, and not the look of the mesh: with the map on the view shows rooms, and
 * a double click takes the room of the face; with the map off it shows the textures, and the click takes the welded
 * area of one texture. Switching the map between two double clicks is how the two are mixed: `Shift` adds the second
 * area to the selection and `Ctrl` takes it away.
 */
export type SelectionFill = 'rooms' | 'textures'

/**
 * Fills the selection with the area a double click stands for.
 *
 * @remarks
 * The answer depends on what the view shows. On the textured level the walk takes the connected faces that share the
 * texture of the click. On the room map it takes the **whole** room of the face, in all the pieces the mesh holds it;
 * and for a face the file never put into a room (the grey of the map) it takes the connected piece of such faces,
 * which stops at the first face of a room: that piece is what the author has to assign anyway.
 *
 * @param fill What the view shows.
 * @param polygons The polygons of the level, in their own order.
 * @param vertexToPolygons The vertex index of `vertexToPolygonsMap`.
 * @param startPolygon The face the click landed on.
 *
 * @returns The indices of the faces of the area, the face of the click included.
 */
export function fillAreaOf(
  fill: SelectionFill,
  polygons: readonly ArxPolygon[],
  vertexToPolygons: ReadonlyMap<string, readonly number[]>,
  startPolygon: number,
): number[] {
  if (fill === 'textures') {
    return sameTextureAreaOf(polygons, vertexToPolygons, startPolygon)
  }

  const room = polygons[startPolygon]?.room

  if (room === undefined || room < 0) {
    return unassignedAreaOf(polygons, vertexToPolygons, startPolygon)
  }

  return roomAreaOf(polygons, room)
}
