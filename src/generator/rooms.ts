import type { ArxPolygon, ArxPortal } from 'arx-convert/types'
import seedrandom from 'seedrandom'

/**
 * The colours a room of the room map takes, in the order a colouring picks them.
 *
 * @remarks
 * The first four are the colours of the map colouring problem (a planar map needs at most four), and the rest are
 * the fallback: a room graph is a volume adjacency graph, not a planar one, so a level can need more than four
 * (five rooms around the same point is a `K5`). The colours are bright and far apart on the hue circle, because the
 * map is read at a glance and not looked at.
 */
export const ROOM_COLORS: readonly string[] = [
  '#d94f4f',
  '#4ca64c',
  '#4f6fd9',
  '#d9a441',
  '#9a5fd9',
  '#3fb5b5',
  '#c46f2e',
  '#7a8a3f',
]

/**
 * How many rooms one colouring can look at before it gives up and takes the next colour count.
 *
 * @remarks
 * The colouring is an exact search: it tries the fewest colours first, and a graph that needs more makes the smaller
 * counts fail. A level has tens of rooms, so the search is short; the budget only stops a pathological room graph from
 * freezing the page.
 */
const SEARCH_BUDGET = 200_000

/**
 * The two rooms a portal joins.
 *
 * @remarks
 * It is the part of a portal the room graph reads: the quad, the radius and the runtime flag say nothing about which
 * rooms are seen through each other. An {@link ArxPortal} has these two fields, so the level's portals fit as they are.
 */
export interface RoomLink {
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
 * A colouring of the rooms of a level.
 */
export interface RoomColoring {
  /**
   * The colour of every room, as the index of {@link ROOM_COLORS}.
   */
  readonly colors: ReadonlyMap<number, number>
  /**
   * How many colours the colouring uses.
   */
  readonly colorCount: number
}

/**
 * What a colouring may draw from.
 */
export interface RoomColoringOptions {
  /**
   * The generator of the tie breaks, so the same seed gives the same colouring.
   *
   * @remarks
   * It is the seeded generator of the level (`seedrandom`), not `Math.random`: a room graph has many valid
   * colourings, and the same level should look the same on every open.
   */
  readonly random?: () => number
}

/**
 * Builds the graph of the rooms: two rooms are neighbours when a portal joins them.
 *
 * @remarks
 * The adjacency is what the colouring needs: two rooms that share a portal are seen through it at the same time, so
 * they must not share a colour. A portal that joins a room to itself says nothing about the colouring and is left
 * out, and so is a portal to a room the map does not have.
 *
 * @param portals The portals of the level.
 * @param rooms The rooms to colour.
 *
 * @returns The neighbours of every room, in the order of the rooms given.
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

    const firstNeighbours = adjacency.get(first)
    const secondNeighbours = adjacency.get(second)

    if (firstNeighbours === undefined || secondNeighbours === undefined) {
      continue
    }

    firstNeighbours.add(second)
    secondNeighbours.add(first)
  }

  return adjacency
}

/**
 * Counts the bits of a number.
 *
 * @param value The number to count.
 *
 * @returns How many of its bits are set.
 */
function bitCount(value: number): number {
  let count = 0
  let rest = value

  while (rest !== 0) {
    rest = rest & (rest - 1)
    count = count + 1
  }

  return count
}

/**
 * Colours a graph with an exact number of colours.
 *
 * @remarks
 * It is a DSATUR search: the room that is next takes the colour that is the most constrained (it has the most
 * coloured neighbours with different colours), and a dead end backtracks. The saturation is read from the colours of
 * the neighbours on every step instead of a running bit set, which keeps the undo simple: a colour is taken back by
 * removing it from its room, and the next step reads the truth again.
 *
 * @param rooms The rooms to colour.
 * @param adjacency The neighbours of every room.
 * @param keys The tie break of every room.
 * @param colorCount How many colours it may use.
 *
 * @returns The colour of every room, or `undefined` when this count is not enough.
 */
function colorGraph(
  rooms: readonly number[],
  adjacency: ReadonlyMap<number, ReadonlySet<number>>,
  keys: ReadonlyMap<number, number>,
  colorCount: number,
): Map<number, number> | undefined {
  const colors = new Map<number, number>()
  let budget = SEARCH_BUDGET

  /**
   * The degree of a room, which breaks a tie of the saturation.
   *
   * @param room The room to read.
   *
   * @returns How many neighbours it has.
   */
  function degreeOf(room: number): number {
    return adjacency.get(room)?.size ?? 0
  }

  /**
   * The colours the neighbours of a room already take.
   *
   * @param room The room to read.
   *
   * @returns The colours, as a bit set.
   */
  function takenColorsOf(room: number): number {
    let taken = 0

    for (const neighbour of adjacency.get(room) ?? []) {
      const color = colors.get(neighbour)

      if (color !== undefined) {
        taken = taken | (1 << color)
      }
    }

    return taken
  }

  /**
   * Picks the room the search colours next.
   *
   * @returns The room, or `undefined` when every room has a colour.
   */
  function nextRoom(): number | undefined {
    let best: number | undefined
    let bestSaturation = -1
    let bestDegree = -1
    let bestKey = Number.POSITIVE_INFINITY

    for (const room of rooms) {
      if (colors.has(room)) {
        continue
      }

      const saturation = bitCount(takenColorsOf(room))
      const degree = degreeOf(room)

      if (
        saturation > bestSaturation ||
        (saturation === bestSaturation && degree > bestDegree) ||
        (saturation === bestSaturation && degree === bestDegree && (keys.get(room) ?? 0) < bestKey)
      ) {
        best = room
        bestSaturation = saturation
        bestDegree = degree
        bestKey = keys.get(room) ?? 0
      }
    }

    return best
  }

  /**
   * Colours the rest of the graph, or takes the last colour back.
   *
   * @returns Whether the whole graph got a colour.
   */
  function search(): boolean {
    const room = nextRoom()

    if (room === undefined) {
      return true
    }

    if (budget <= 0) {
      return false
    }

    budget = budget - 1

    const taken = takenColorsOf(room)

    for (let color = 0; color < colorCount; color++) {
      if ((taken & (1 << color)) !== 0) {
        continue
      }

      colors.set(room, color)

      if (search()) {
        return true
      }

      colors.delete(room)
    }

    return false
  }

  if (search()) {
    return colors
  }

  return undefined
}

/**
 * Colours the rooms so that two rooms joined by a portal never share a colour.
 *
 * @remarks
 * The search asks for the **fewest** colours first and adds one when the graph can not be coloured with that many: a
 * level whose room graph is a tree takes two colours and looks calm, and a graph that needs five takes five. The
 * colour count is exact for the counts it accepts (a backtracking search, not a greedy pass), so a bigger count is
 * only used when the smaller one was proven impossible.
 *
 * The tie breaks come from {@link RoomColoringOptions.random}: the same seed colours the same level the same way.
 * When the graph needs more colours than {@link ROOM_COLORS} holds, the colour index of a room can be past the
 * palette, and the reader takes it modulo the palette length.
 *
 * @param portals The portals of the level.
 * @param rooms The rooms to colour.
 * @param options What the search may draw from.
 *
 * @returns The colour of every room, and how many colours the colouring uses.
 */
export function roomColoringOf(
  portals: readonly RoomLink[],
  rooms: readonly number[],
  options: RoomColoringOptions = {},
): RoomColoring {
  const ids = [...new Set(rooms)]
    .filter((room) => {
      return room >= 0
    })
    .toSorted((first, second) => {
      return first - second
    })
  const random = options.random ?? Math.random
  const adjacency = roomAdjacencyOf(portals, ids)

  // one key per room, drawn once: the tie break of the search is then a part of the seed, not of the order the page
  // happens to walk the rooms in
  const keys = new Map<number, number>()

  for (const room of ids) {
    keys.set(room, random())
  }

  for (let colorCount = 1; colorCount <= ids.length; colorCount++) {
    const colors = colorGraph(ids, adjacency, keys, colorCount)

    if (colors !== undefined) {
      return { colors, colorCount }
    }
  }

  // a graph can always be coloured with one colour per room, so this is the end of the ladder
  const colors = new Map<number, number>()

  for (const [index, room] of ids.entries()) {
    colors.set(room, index)
  }

  return { colors, colorCount: ids.length }
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
 * One room of the level, as the areas panel lists it.
 */
export interface RoomSummary {
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
 * Reads the rooms of a level, with the faces they hold.
 *
 * @remarks
 * It is the list the areas panel shows: every room a face belongs to, once, in the order of the ids. The rooms the
 * file reserves (the 0, and the gaps an edit leaves) are not here, because the author edits areas and not records.
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
 * Colours the rooms of a level the way the editor shows them.
 *
 * @remarks
 * The tie breaks come from the **id of the level**, not from its seed: the same level paints the same map on every
 * visit (a link, a reload, another tab), and a level keeps its colours when it is generated again with another seed.
 *
 * @param portals The links the level is built from.
 * @param rooms Which ids take a colour.
 * @param mapId The name the level is stored under (`arx:2`, `custom:0`, …).
 *
 * @returns The colour of every room in the level.
 */
export function roomColoringForLevel(
  portals: readonly RoomLink[],
  rooms: readonly number[],
  mapId: string,
): RoomColoring {
  return roomColoringOf(portals, rooms, { random: seedrandom(`${mapId}:rooms`) })
}

/**
 * The colour of one room in a colouring.
 *
 * @param room The room to read.
 * @param coloring The colouring of the level.
 *
 * @returns The css colour of the room, or `undefined` when the colouring does not hold it.
 */
export function roomPaletteOf(room: number, coloring: RoomColoring): string | undefined {
  const index = coloring.colors.get(room)

  if (index === undefined) {
    return undefined
  }

  return ROOM_COLORS[index % ROOM_COLORS.length]
}
