import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon, ArxRoomDistance, ArxVector3 } from 'arx-convert/types'
import { roomCentersOf, roomDistancesOf, type DistancePortal } from '../../src/generator/roomDistances.ts'

/**
 * Builds a polygon with a known center, for one room.
 *
 * @remarks
 * The center of a polygon is the average of its corners, so the four corners are placed around the point.
 *
 * @param room Where the polygon belongs.
 * @param center The point its corners average to.
 *
 * @returns A face with the corners placed around that point.
 */
function polygonAt(room: number, center: ArxVector3): ArxPolygon {
  const radius = 1

  return {
    flags: 64,
    room,
    vertices: [
      { x: center.x - radius, y: center.y, z: center.z - radius },
      { x: center.x + radius, y: center.y, z: center.z - radius },
      { x: center.x - radius, y: center.y, z: center.z + radius },
      { x: center.x + radius, y: center.y, z: center.z + radius },
    ],
  } as unknown as ArxPolygon
}

/**
 * Builds a portal whose crossing point is the given center, for two rooms.
 *
 * @param first One room.
 * @param second The other room.
 * @param center The point the quad crosses the wall at.
 *
 * @returns The door between the two rooms.
 */
function portalAt(first: number, second: number, center: ArxVector3): DistancePortal {
  const radius = 2

  /**
   * Places one corner of the quad around the center.
   *
   * @param x The offset on the x axis.
   * @param z The offset on the z axis.
   *
   * @returns The point of the quad.
   */
  function corner(x: number, z: number): { readonly position: ArxVector3 } {
    return { position: { x: center.x + x, y: center.y, z: center.z + z } }
  }

  return {
    room1: first,
    room2: second,
    polygon: {
      vertices: [corner(-radius, -radius), corner(radius, -radius), corner(-radius, radius), corner(radius, radius)],
    },
  }
}

/**
 * Reads the distance of a pair out of the flat matrix.
 *
 * @param distances The matrix.
 * @param from The room the path starts in.
 * @param to The room the path goes to.
 * @param roomCount How many room records the level has.
 *
 * @returns The entry of the pair.
 */
function pairOf(
  distances: readonly ArxRoomDistance[],
  from: number,
  to: number,
  roomCount: number,
): ArxRoomDistance | undefined {
  const row = to * roomCount

  return distances[from + row]
}

void describe('roomCentersOf', () => {
  void it('reads the center of a room from the box of its polygons', () => {
    const polygons = [polygonAt(1, { x: 0, y: 0, z: 0 }), polygonAt(1, { x: 10, y: 4, z: 20 })]

    assert.deepEqual(roomCentersOf(polygons).get(1), { x: 5, y: 2, z: 10 })
  })

  void it('keeps the rooms apart', () => {
    const centers = roomCentersOf([polygonAt(1, { x: 0, y: 0, z: 0 }), polygonAt(2, { x: 8, y: 0, z: 0 })])

    assert.deepEqual(
      centers
        .keys()
        .toArray()
        .toSorted((first, second) => {
          return first - second
        }),
      [1, 2],
    )
    assert.deepEqual(centers.get(2), { x: 8, y: 0, z: 0 })
  })

  void it('leaves a polygon without a room out', () => {
    assert.equal(roomCentersOf([polygonAt(-1, { x: 0, y: 0, z: 0 })]).size, 0)
  })
})

void describe('roomDistancesOf', () => {
  const centers = new Map<number, ArxVector3>([
    [1, { x: 0, y: 0, z: 0 }],
    [2, { x: 10, y: 0, z: 0 }],
    [3, { x: 20, y: 0, z: 0 }],
  ])
  const roomCount = 4
  const firstDoor = portalAt(1, 2, { x: 5, y: 0, z: 0 })
  const secondDoor = portalAt(2, 3, { x: 15, y: 0, z: 0 })

  void it('gives every pair the straight line without a portal', () => {
    const distances = roomDistancesOf(centers, [], roomCount)

    assert.equal(distances.length, roomCount ** 2)
    assert.equal(
      distances.every((entry) => {
        return entry.distance === -1
      }),
      true,
    )
  })

  void it('gives the same room the straight line', () => {
    const distances = roomDistancesOf(centers, [firstDoor, secondDoor], roomCount)

    assert.equal(pairOf(distances, 1, 1, roomCount)?.distance, -1)
    assert.equal(pairOf(distances, 2, 2, roomCount)?.distance, -1)
  })

  void it('gives the rooms that share a portal the straight line', () => {
    // the archived editor left the contiguous rooms out on purpose: the player sees the other side of the opening
    const distances = roomDistancesOf(centers, [firstDoor, secondDoor], roomCount)

    assert.equal(pairOf(distances, 1, 2, roomCount)?.distance, -1)
    assert.equal(pairOf(distances, 2, 1, roomCount)?.distance, -1)
    assert.equal(pairOf(distances, 2, 3, roomCount)?.distance, -1)
    assert.equal(pairOf(distances, 3, 2, roomCount)?.distance, -1)
  })

  void it('measures the path between two rooms two openings apart', () => {
    // room 1 and room 3 are only reachable through the doors of room 2: the distance is the walk between the two
    // crossings, and the game adds the entity and the camera to its ends
    const distances = roomDistancesOf(centers, [firstDoor, secondDoor], roomCount)

    assert.equal(pairOf(distances, 1, 3, roomCount)?.distance, 10)
    assert.deepEqual(pairOf(distances, 1, 3, roomCount)?.startPosition, { x: 5, y: 0, z: 0 })
    assert.deepEqual(pairOf(distances, 1, 3, roomCount)?.endPosition, { x: 15, y: 0, z: 0 })
  })

  void it('reads the pair the other way round from the other side', () => {
    const distances = roomDistancesOf(centers, [firstDoor, secondDoor], roomCount)

    assert.equal(pairOf(distances, 3, 1, roomCount)?.distance, 10)
    assert.deepEqual(pairOf(distances, 3, 1, roomCount)?.startPosition, { x: 15, y: 0, z: 0 })
    assert.deepEqual(pairOf(distances, 3, 1, roomCount)?.endPosition, { x: 5, y: 0, z: 0 })
  })

  void it('leaves the room that no portal reaches on the straight line', () => {
    const distances = roomDistancesOf(
      new Map<number, ArxVector3>([...centers, [9, { x: 100, y: 0, z: 0 }]]),
      [firstDoor, secondDoor],
      10,
    )

    assert.equal(pairOf(distances, 9, 1, 10)?.distance, -1)
    assert.equal(pairOf(distances, 1, 9, 10)?.distance, -1)
  })

  void it('writes the matrix in the order the game reads it', () => {
    // the loader walks the target room in the outer loop, so the pair (2, 3) is the record at 2 + 3 * roomCount
    const distances = roomDistancesOf(centers, [firstDoor, secondDoor], roomCount)
    const row = 3 * roomCount
    const index = 1 + row

    assert.equal(distances[index].distance, 10)
  })
})
