import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { vertexToPolygonsMap } from '../../src/generator/polygons.ts'
import {
  ROOM_COLORS,
  roomAdjacencyOf,
  roomAreaOf,
  roomColoringForLevel,
  roomColoringOf,
  roomIdsOf,
  roomPaletteOf,
  roomRenumberingOf,
  roomSummaryOf,
  unassignedAreaOf,
  type RoomLink,
} from '../../src/generator/rooms.ts'

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
    const coloring = roomColoringOf([])

    assert.equal(coloring.colors.size, 0)
    assert.equal(coloring.colorCount, 0)
  })

  void it('ties the colour of a room to its id', () => {
    // the room 1 is the first colour of the palette, the room 2 the second: the colours of a level stay where they are
    // while it is edited
    const coloring = roomColoringOf([1, 2, 3])

    assert.deepEqual(coloring.colors.entries().toArray(), [
      [1, 0],
      [2, 1],
      [3, 2],
    ])
    assert.equal(coloring.colorCount, 3)
  })

  void it('keeps the colours of the rooms when another one goes', () => {
    // the owner deleted a room, and the colours of the rooms after it shifted down (2026-11-15)
    const before = roomColoringOf([1, 2, 3, 4])
    const after = roomColoringOf([1, 3, 4])

    assert.equal(after.colors.get(3), before.colors.get(3))
    assert.equal(after.colors.get(4), before.colors.get(4))
  })

  void it('walks the palette again after its last colour', () => {
    // the palette is shorter than a level's rooms: two rooms far apart in the ids share a colour
    const palette = ROOM_COLORS.length
    const coloring = roomColoringOf([1, palette + 1])

    assert.equal(coloring.colors.get(palette + 1), coloring.colors.get(1))
    assert.equal(coloring.colorCount, 1)
  })

  void it('gives the room 0 the last colour of the palette', () => {
    // the room 0 is the outside of the game's rooms: the first room the author sees is the first colour
    const coloring = roomColoringOf([0, 1])

    assert.equal(coloring.colors.get(0), ROOM_COLORS.length - 1)
    assert.equal(coloring.colors.get(1), 0)
  })

  void it('leaves the face without a room out', () => {
    const coloring = roomColoringOf([-1, 2])

    assert.deepEqual(coloring.colors.keys().toArray(), [2])
  })

  void it('gives the same rooms the same colours every time', () => {
    const first = roomColoringForLevel([1, 2, 3])
    const second = roomColoringForLevel([1, 2, 3])

    assert.deepEqual(new Map(first.colors), new Map(second.colors))
    assert.equal(first.colorCount, second.colorCount)
  })
})

/**
 * Builds a quad of the test at a place of the level, in a room.
 *
 * @param x Where the quad starts on the X axis: two quads of the test touch when their starts differ by ten.
 * @param room Which area it belongs to, or -1 for a face the file never assigned.
 *
 * @returns A quad of one texture, placed at that spot.
 */
function faceAt(x: number, room: number): ArxPolygon {
  return {
    vertices: [
      { x, y: 0, z: 0, u: 0, v: 0 },
      { x: x + 10, y: 0, z: 0, u: 1, v: 0 },
      { x: x + 10, y: 0, z: 10, u: 1, v: 1 },
      { x, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId: 1,
    room,
  } as unknown as ArxPolygon
}

void describe('roomAreaOf', () => {
  void it('takes every face of the room, in the order of the level', () => {
    const polygons = [faceAt(0, 2), faceAt(10, 1), faceAt(20, 2), faceAt(30, 1)]

    // a room can be in more than one piece, and the whole of it is the area of a double click
    assert.deepEqual(roomAreaOf(polygons, 2), [0, 2])
  })

  void it('gives nothing for the id of no room', () => {
    assert.deepEqual(roomAreaOf([faceAt(0, -1), faceAt(10, 1)], -1), [])
  })
})

void describe('unassignedAreaOf', () => {
  void it('fills the connected faces that have no room', () => {
    const polygons = [faceAt(0, -1), faceAt(10, -1), faceAt(20, 3)]
    const area = unassignedAreaOf(polygons, vertexToPolygonsMap(polygons), 0)

    assert.deepEqual(
      area.toSorted((a, b) => {
        return a - b
      }),
      [0, 1],
    )
  })

  void it('stops at the first face of a room', () => {
    const polygons = [faceAt(0, -1), faceAt(10, 3), faceAt(20, -1)]

    assert.deepEqual(unassignedAreaOf(polygons, vertexToPolygonsMap(polygons), 0), [0])
  })
})

void describe('roomSummaryOf', () => {
  void it('counts the faces of every room, in the order of the ids', () => {
    const polygons = [{ room: 3 }, { room: 1 }, { room: 3 }, { room: 2 }] as unknown as ArxPolygon[]

    assert.deepEqual(roomSummaryOf(polygons), [
      { room: 1, faceCount: 1 },
      { room: 2, faceCount: 1 },
      { room: 3, faceCount: 2 },
    ])
  })

  void it('leaves the faces without a room out', () => {
    const polygons = [{ room: -1 }, { room: 1 }] as unknown as ArxPolygon[]

    assert.deepEqual(roomSummaryOf(polygons), [{ room: 1, faceCount: 1 }])
  })

  void it('reads no room from no face', () => {
    assert.deepEqual(roomSummaryOf([]), [])
  })
})

void describe('roomPaletteOf', () => {
  void it('reads the colour of a room from the colouring', () => {
    const coloring = roomColoringForLevel([1, 2])

    assert.notEqual(roomPaletteOf(1, coloring), undefined)
    assert.notEqual(roomPaletteOf(1, coloring), roomPaletteOf(2, coloring))
  })

  void it('gives nothing for a room the colouring does not hold', () => {
    const coloring = roomColoringForLevel([1])

    assert.equal(roomPaletteOf(9, coloring), undefined)
  })

  void it('keeps the colours of the same level', () => {
    // the colouring is tied to the room ids: the same level paints the same map on every visit
    const a = roomColoringForLevel([1, 2, 3])
    const b = roomColoringForLevel([1, 2, 3])

    assert.deepEqual([...a.colors], [...b.colors])
  })
})

void describe('roomRenumberingOf', () => {
  void it('fills the holes of the numbering', () => {
    assert.deepEqual(
      [...roomRenumberingOf([1, 3, 4])],
      [
        [1, 1],
        [3, 2],
        [4, 3],
      ],
    )
  })

  void it('leaves a numbering without holes as it is', () => {
    assert.deepEqual(
      [...roomRenumberingOf([1, 2, 3])],
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    )
  })

  void it('leaves the room of the outside where it is', () => {
    assert.equal(roomRenumberingOf([0, 2]).has(0), false)
    assert.equal(roomRenumberingOf([0, 2]).get(2), 1)
  })

  void it('leaves the faces without a room out', () => {
    assert.equal(roomRenumberingOf([-1, 1]).has(-1), false)
  })
})
