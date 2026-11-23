import type { ArxPolygon, ArxPortal } from 'arx-convert/types'
import { connectedAreaOf } from './polygons.ts'

/**
 * The colors a room of the room map takes, in the order a coloring picks them.
 *
 * @remarks
 * The first four are the colors of the map coloring problem (a planar map needs at most four), and the rest are
 * the fallback: a room graph is a volume adjacency graph, not a planar one, so a level can need more than four
 * (five rooms around the same point is a `K5`). The colors are far apart on the hue circle, because the map is read
 * at a glance and not looked at.
 *
 * They are a step darker than the pure hues (about twelve percent, 2026-11-10, the owner): the first red, green and
 * blue glowed on the map, and the surfaces of a room read better a little deeper.
 */
export const ROOM_COLORS: readonly string[] = Object.freeze([
  '#bf4646',
  '#439243',
  '#4662bf',
  '#bf9039',
  '#8854bf',
  '#379f9f',
  '#ac6228',
  '#6b7937',
])

/**
 * The two rooms a portal joins.
 *
 * @remarks
 * It is the part of a portal the room graph reads: the quad, the radius and the runtime flag say nothing about which
 * rooms are seen through each other. An {@link ArxPortal} has these two fields, so the level's portals fit as they are.
 */
export type RoomLink = {
  /**
   * The room on the side the normal faces.
   */
  readonly room1: number
  /**
   * The room on the other side.
   */
  readonly room2: number
}

/**
 * A coloring of the rooms of a level.
 */
export type RoomColoring = {
  /**
   * The color of every room, as the index of {@link ROOM_COLORS}.
   */
  readonly colors: ReadonlyMap<number, number>
  /**
   * How many colors the coloring uses.
   */
  readonly colorCount: number
}

/**
 * Builds the graph of the rooms: two rooms are neighbors when a portal joins them.
 *
 * @remarks
 * The graph is what the room features read (the portals of a level as the rooms they join); the colors of the map are
 * keyed with the room ids and do not need it (2026-11-15). A portal that joins a room to itself says nothing about the
 * graph and is left out, and so is a portal to a room the level does not have.
 *
 * @param portals The portals of the level.
 * @param rooms The rooms to color.
 *
 * @returns The neighbors of every room, in the order of the rooms given.
 */
export function roomAdjacencyOf(portals: readonly RoomLink[], rooms: readonly number[]): Map<number, Set<number>> {
  const known = new Set(rooms)
  const adjacency = new Map<number, Set<number>>()

  for (const room of rooms) {
    adjacency.set(room, new Set())
  }

  for (const portal of portals) {
    const first = portal.room1
    const second = portal.room2

    if (first === second || !known.has(first) || !known.has(second)) {
      continue
    }

    const firstNeighbors = adjacency.get(first)
    const secondNeighbors = adjacency.get(second)

    if (firstNeighbors === undefined || secondNeighbors === undefined) {
      continue
    }

    firstNeighbors.add(second)
    secondNeighbors.add(first)
  }

  return adjacency
}

/**
 * Colors the rooms of a level.
 *
 * @remarks
 * The color of a room is its **id** in the palette: the room `1` takes the first color, the room `2` the second, and
 * the palette starts again after its last one. The binding to the id is what keeps the map readable while the level is
 * edited: a room that is deleted takes its color with it, and the rooms after it keep theirs (2026-11-15, the owner:
 * deleting a room shifted the colors of the others). The palette is shorter than a level's rooms, so the colors come
 * back after it: two rooms far apart in the ids share one, which is the price of a color that does not move.
 *
 * The room `0` is the outside of the game's rooms, and it takes the last color of the palette, so the first room the
 * author sees is the first color.
 *
 * @param rooms The rooms to color.
 *
 * @returns The color of every room, and how many colors the coloring uses.
 */
export function roomColoringOf(rooms: readonly number[]): RoomColoring {
  const colors = new Map<number, number>()
  const palette = ROOM_COLORS.length

  for (const room of rooms) {
    if (room < 0) {
      continue
    }

    // the room 1 is the first color, and the room 0 (the outside) the last one
    const index = (((room - 1) % palette) + palette) % palette

    colors.set(room, index)
  }

  return { colors, colorCount: new Set(colors.values()).size }
}

/**
 * Reads the rooms a set of polygons belongs to.
 *
 * @param rooms The room of every polygon.
 *
 * @returns The room ids, without the negative ones, in ascending order.
 */
export function roomIdsOf(rooms: readonly number[]): number[] {
  const ids = new Set<number>()

  for (const room of rooms) {
    if (room >= 0) {
      ids.add(room)
    }
  }

  return [...ids].toSorted((first, second) => {
    return first - second
  })
}

/**
 * One room of the level, as the room inspector lists it.
 */
export type RoomSummary = {
  /**
   * The id the level uses for the room.
   */
  readonly room: number
  /**
   * How many faces the room holds.
   */
  readonly faceCount: number
}

/**
 * The faces of a room, in the order of the level.
 *
 * @remarks
 * The whole room, in whichever pieces the mesh holds it: an area is one thing for the game, so a double click on the
 * room map takes all of it and not only the piece the click landed on. The count is the one the room inspector shows.
 *
 * @param polygons The polygons of the level.
 * @param room The id of the room.
 *
 * @returns The indices of the faces of the room, and nothing for the id of no room.
 */
export function roomAreaOf(polygons: readonly ArxPolygon[], room: number): number[] {
  if (room < 0) {
    return []
  }

  const area: number[] = []

  for (const [index, polygon] of polygons.entries()) {
    if (polygon.room === room) {
      area.push(index)
    }
  }

  return area
}

/**
 * The connected faces that have no room, starting from one of them.
 *
 * @remarks
 * It is the fill of a double click on the room map over a face the file never put into a room (the gray of the map):
 * the piece of mesh that is still to be assigned. The walk stops at the first face that belongs to a room, so no face
 * of a room comes along, and the author can give the piece a room of its own without taking anything away.
 *
 * @param polygons The polygons of the level.
 * @param vertexToPolygons The vertex index of `vertexToPolygonsMap`.
 * @param startPolygon The face the click landed on: it has no room.
 *
 * @returns The indices of the faces of the area, the start one included.
 */
export function unassignedAreaOf(
  polygons: readonly ArxPolygon[],
  vertexToPolygons: ReadonlyMap<string, readonly number[]>,
  startPolygon: number,
): number[] {
  return connectedAreaOf(polygons, vertexToPolygons, startPolygon, (polygon) => {
    return polygon.room < 0
  })
}

/**
 * Reads the rooms of a level, with the faces they hold.
 *
 * @remarks
 * It is the list the room inspector shows: every room a face belongs to, once, in the order of the ids. The rooms the
 * file reserves (the 0, and the gaps an edit leaves) are not here, because the author edits rooms and not records.
 *
 * @param polygons The polygons of the level.
 *
 * @returns The rooms, in ascending order, with the number of their faces.
 */
export function roomSummaryOf(polygons: readonly ArxPolygon[]): RoomSummary[] {
  const counts = new Map<number, number>()

  for (const polygon of polygons) {
    if (polygon.room < 0) {
      continue
    }

    counts.set(polygon.room, (counts.get(polygon.room) ?? 0) + 1)
  }

  return counts
    .keys()
    .toArray()
    .toSorted((first, second) => {
      return first - second
    })
    .map((room) => {
      return { room, faceCount: counts.get(room) ?? 0 }
    })
}

/**
 * Colors the rooms of a level: the color of a room is its id in the palette.
 *
 * @param rooms The rooms the level has a face in.
 *
 * @returns The color of every room, tied to its id.
 */
export function roomColoringForLevel(rooms: readonly number[]): RoomColoring {
  return roomColoringOf(rooms)
}

/**
 * The color of one room in a coloring.
 *
 * @param room The room to read.
 * @param coloring The coloring of the level.
 *
 * @returns The css color of the room, or `undefined` when the coloring does not hold it.
 */
export function roomPaletteOf(room: number, coloring: RoomColoring): string | undefined {
  const index = coloring.colors.get(room)

  if (index === undefined) {
    return undefined
  }

  return ROOM_COLORS[index % ROOM_COLORS.length]
}

/**
 * The new ids of the rooms a level uses, without the holes (1, 3, 4 becomes 1, 2, 3).
 *
 * @remarks
 * The game walks the rooms of the file by their ids, so a hole is a room with nothing in it: the export fills the holes
 * by moving the rooms after them down, and every place that names a room (the polygons, the portals, the distances, the
 * names) follows the same map. Room **0** stays where it is: the game reserves it for the outside.
 *
 * @param rooms The ids the level uses.
 *
 * @returns The old id and the new one, in the order of the old ones.
 */
export function roomRenumberingOf(rooms: Iterable<number>): Map<number, number> {
  const used = [...new Set(rooms)]
    .filter((room) => {
      return room > 0
    })
    .toSorted((first, second) => {
      return first - second
    })
  const renumbering = new Map<number, number>()

  for (const [position, room] of used.entries()) {
    renumbering.set(room, position + 1)
  }

  return renumbering
}
