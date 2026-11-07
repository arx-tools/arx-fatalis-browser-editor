import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import seedrandom from 'seedrandom'
import { roomAdjacencyOf, roomColoringOf, roomIdsOf, type RoomLink } from '../../src/generator/rooms.ts'

/**
 * Builds a portal between two rooms.
 *
 * @remarks
 * The colouring only reads the two room ids, so the rest of a portal (the quad, the radius, the runtime flag) is left
 * out: those do not take part in the graph.
 *
 * @param first One side of the portal.
 * @param second The other side.
 *
 * @returns The link between the two sides.
 */
function portalBetween(first: number, second: number): RoomLink {
  return { room1: first, room2: second }
}

/**
 * Builds the portals of a clique: every room joined to every other one.
 *
 * @param rooms Which ids take part.
 *
 * @returns One link for every pair.
 */
function cliqueOf(rooms: readonly number[]): RoomLink[] {
  const portals: RoomLink[] = []

  for (const [index, first] of rooms.entries()) {
    for (const second of rooms.slice(index + 1)) {
      portals.push(portalBetween(first, second))
    }
  }

  return portals
}

/**
 * Tells whether a portal joins two rooms of the same colour.
 *
 * @param portals The portals of the level.
 * @param colors The colour of every room.
 *
 * @returns Whether a colouring breaks the one rule it has.
 */
function hasNeighbourConflict(portals: readonly RoomLink[], colors: ReadonlyMap<number, number>): boolean {
  return portals.some((portal) => {
    const first = colors.get(portal.room1)
    const second = colors.get(portal.room2)

    return first !== undefined && second !== undefined && first === second
  })
}

void describe('roomIdsOf', () => {
  void it('reads the rooms of a set of polygons once each, in order', () => {
    assert.deepEqual(roomIdsOf([3, 1, 3, 2, 1]), [1, 2, 3])
  })

  void it('leaves out the polygons without a room', () => {
    assert.deepEqual(roomIdsOf([2, -1, 0, -1, 2]), [0, 2])
  })

  void it('reads no room from no polygon', () => {
    assert.deepEqual(roomIdsOf([]), [])
  })
})

void describe('roomAdjacencyOf', () => {
  void it('joins the two rooms of a portal in both directions', () => {
    const adjacency = roomAdjacencyOf([portalBetween(1, 2)], [1, 2])

    assert.deepEqual([...(adjacency.get(1) ?? [])], [2])
    assert.deepEqual([...(adjacency.get(2) ?? [])], [1])
  })

  void it('leaves out a portal that joins a room to itself', () => {
    const adjacency = roomAdjacencyOf([portalBetween(1, 1)], [1])

    assert.equal(adjacency.get(1)?.size, 0)
  })

  void it('leaves out a portal to a room the level does not colour', () => {
    const adjacency = roomAdjacencyOf([portalBetween(1, 9)], [1])

    assert.equal(adjacency.get(1)?.size, 0)
  })

  void it('gives every room a neighbour set, even without a portal', () => {
    const adjacency = roomAdjacencyOf([], [4, 5])

    assert.deepEqual(adjacency.keys().toArray(), [4, 5])
    assert.equal(adjacency.get(4)?.size, 0)
  })
})

void describe('roomColoringOf', () => {
  void it('colours no room when there is no room', () => {
    const coloring = roomColoringOf([], [])

    assert.equal(coloring.colors.size, 0)
    assert.equal(coloring.colorCount, 0)
  })

  void it('colours a room that is alone with one colour', () => {
    const coloring = roomColoringOf([], [7])

    assert.deepEqual([...coloring.colors], [[7, 0]])
    assert.equal(coloring.colorCount, 1)
  })

  void it('colours two rooms that share a portal with two colours', () => {
    const portals = [portalBetween(1, 2)]
    const coloring = roomColoringOf(portals, [1, 2])

    assert.equal(coloring.colorCount, 2)
    assert.notEqual(coloring.colors.get(1), coloring.colors.get(2))
  })

  void it('colours a ring of four rooms with two colours', () => {
    // a ring is the map colouring problem with an even cycle: two colours are enough, and the search has to find them
    // instead of spending four
    const portals = [portalBetween(1, 2), portalBetween(2, 3), portalBetween(3, 4), portalBetween(4, 1)]
    const coloring = roomColoringOf(portals, [1, 2, 3, 4])

    assert.equal(coloring.colorCount, 2)
    assert.equal(hasNeighbourConflict(portals, coloring.colors), false)
  })

  void it('colours four rooms that all touch with four colours', () => {
    const portals = cliqueOf([1, 2, 3, 4])
    const coloring = roomColoringOf(portals, [1, 2, 3, 4])

    assert.equal(coloring.colorCount, 4)
    assert.equal(new Set(coloring.colors.values()).size, 4)
    assert.equal(hasNeighbourConflict(portals, coloring.colors), false)
  })

  void it('takes a fifth colour when five rooms all touch', () => {
    // a room graph is a volume adjacency graph, not a planar map: a K5 is possible, and the four colour theorem does
    // not promise anything there
    const portals = cliqueOf([1, 2, 3, 4, 5])
    const coloring = roomColoringOf(portals, [1, 2, 3, 4, 5])

    assert.equal(coloring.colorCount, 5)
    assert.equal(hasNeighbourConflict(portals, coloring.colors), false)
  })

  void it('colours a graph with a portal per room and no conflict', () => {
    // a small level: a hub room (1) joined to three rooms, and one of them joined to a fourth
    const portals = [
      portalBetween(1, 2),
      portalBetween(1, 3),
      portalBetween(1, 4),
      portalBetween(2, 5),
      portalBetween(3, 4),
    ]
    const coloring = roomColoringOf(portals, [1, 2, 3, 4, 5])

    assert.equal(hasNeighbourConflict(portals, coloring.colors), false)
    assert.equal(coloring.colors.size, 5)
  })

  void it('colours the rooms that have no portal too', () => {
    const coloring = roomColoringOf([], [1, 2, 3])

    assert.equal(coloring.colors.size, 3)
    assert.equal(coloring.colorCount, 1)
  })

  void it('gives the same rooms the same colours from the same seed', () => {
    const portals = [
      portalBetween(1, 2),
      portalBetween(2, 3),
      portalBetween(3, 4),
      portalBetween(4, 5),
      portalBetween(5, 1),
      portalBetween(1, 3),
    ]
    const rooms = [1, 2, 3, 4, 5]
    const first = roomColoringOf(portals, rooms, { random: seedrandom('arx') })
    const second = roomColoringOf(portals, rooms, { random: seedrandom('arx') })

    assert.deepEqual(new Map(first.colors), new Map(second.colors))
    assert.equal(first.colorCount, second.colorCount)
  })
})
