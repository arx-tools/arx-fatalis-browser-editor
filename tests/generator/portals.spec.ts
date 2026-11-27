import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPortal, ArxVector3 } from 'arx-convert/types'
import { Vector3 } from 'three'
import { BLANK_LEVEL_ORIGIN, createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { DEFAULT_PORTAL_HEIGHT, generatePortalsOf } from '../../src/generator/portals.ts'
import { Settings } from '../../src/generator/Settings.ts'

/**
 * Builds the flat level of the editor: an 11×11 floor of tiles, all in room 1.
 *
 * @returns The level, ready to be read.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * Splits the flat level into two rooms along a line of the grid.
 *
 * @remarks
 * Every tile whose first corner is left of the middle becomes room 2: the two rooms meet on a straight line of eleven
 * tile edges, which is one run of the boundary.
 *
 * @param map The level to split.
 *
 * @returns The level, with its two rooms.
 */
function splitRooms(map: ArxMap): ArxMap {
  map.setFaceRooms(
    map.polygons.map((polygon, index) => {
      const side = polygon.vertices[0]?.x ?? 0
      let room = 1

      if (side < BLANK_LEVEL_ORIGIN.x) {
        room = 2
      }

      return { index, room }
    }),
  )

  return map
}

/**
 * Reads the center of a room.
 *
 * @param map The level to read.
 * @param room The room to measure.
 *
 * @returns The average of the corners of its faces, in the game's coordinates.
 */
function centerOfRoom(map: ArxMap, room: number): ArxVector3 {
  let x = 0
  let y = 0
  let z = 0
  let count = 0

  for (const polygon of map.polygons) {
    if (polygon.room !== room) {
      continue
    }

    for (const vertex of polygon.vertices) {
      x = x + vertex.x
      y = y + vertex.y
      z = z + vertex.z
      count = count + 1
    }
  }

  return { x: x / count, y: y / count, z: z / count }
}

/**
 * Reads the normal of a portal from its corners.
 *
 * @param polygon The quad whose corners give the normal.
 *
 * @returns The normal the game reads from the stored order.
 */
function normalOfPortal(polygon: ArxPortal['polygon']): Vector3 {
  const [first, second, third] = polygon.vertices

  if (first === undefined || second === undefined || third === undefined) {
    return new Vector3()
  }

  return new Vector3()
    .crossVectors(
      new Vector3(
        second.position.x - first.position.x,
        second.position.y - first.position.y,
        second.position.z - first.position.z,
      ),
      new Vector3(
        third.position.x - first.position.x,
        third.position.y - first.position.y,
        third.position.z - first.position.z,
      ),
    )
    .normalize()
}

/**
 * Reads the only portal a split level has.
 *
 * @param map The level whose portal is read.
 * @param height The height of the quad above the boundary.
 *
 * @returns The one portal of the boundary.
 *
 * @throws When the generator gives another number of portals.
 */
function onlyPortalOf(map: ArxMap, height = DEFAULT_PORTAL_HEIGHT): ArxPortal {
  const portals = generatePortalsOf(map.polygons, { height })

  assert.equal(portals.length, 1)

  const portal = portals[0]

  if (portal === undefined) {
    throw new Error('the generator gave no portal')
  }

  return portal
}

void describe('generatePortalsOf', () => {
  void it('gives no portal to a level with one room', () => {
    assert.deepEqual(generatePortalsOf(flatMap().polygons), [])
  })

  void it('makes one quad of the eleven edges of a straight boundary', () => {
    const map = splitRooms(flatMap())
    const portal = onlyPortalOf(map)

    // the eleven edges of the line are one run, so one door
    assert.deepEqual(
      [portal.room1, portal.room2].toSorted((first, second) => {
        return first - second
      }),
      [1, 2],
    )
    // the line is the middle of the floor on the X axis, between its two rooms, from one side of the floor to the
    // other, and the quad is the default 2 m high. The tiles start half a floor before the origin, so the edge of the
    // line is the one of the six tiles: fifty units past the origin
    const line = BLANK_LEVEL_ORIGIN.x + 50

    assert.equal(portal.polygon.min.x, line)
    assert.equal(portal.polygon.max.x, line)
    assert.equal(portal.polygon.min.z, BLANK_LEVEL_ORIGIN.z - 550)
    assert.equal(portal.polygon.max.z, BLANK_LEVEL_ORIGIN.z + 550)
    assert.equal(portal.polygon.max.y - portal.polygon.min.y, DEFAULT_PORTAL_HEIGHT)
    assert.equal(portal.polygon.vertices.length, 4)
  })

  void it('stores the corners so the perimeter walks the rectangle, not its diagonals', () => {
    const map = splitRooms(flatMap())
    const portal = onlyPortalOf(map)
    const perimeter = [0, 1, 3, 2]
    const isRectangleEdge: boolean[] = []

    for (let index = 0; index < perimeter.length; index++) {
      const from = portal.polygon.vertices[perimeter[index]]
      const to = portal.polygon.vertices[perimeter[(index + 1) % perimeter.length]]

      if (from === undefined || to === undefined) {
        isRectangleEdge.push(false)

        continue
      }

      const horizontal = Math.abs(from.position.y - to.position.y) < 0.000_001
      const vertical =
        Math.abs(from.position.x - to.position.x) < 0.000_001 && Math.abs(from.position.z - to.position.z) < 0.000_001

      // a bowtie would leave two diagonal edges (the top of one side to the bottom of the other)
      isRectangleEdge.push(horizontal || vertical)
    }

    assert.deepEqual(isRectangleEdge, [true, true, true, true])
  })

  void it('writes the radius in the first vertex only', () => {
    const map = splitRooms(flatMap())
    const portal = onlyPortalOf(map)

    assert.ok(portal.polygon.vertices[0].rhw > 0)
    assert.deepEqual(
      portal.polygon.vertices.slice(1).map((vertex) => {
        return vertex.rhw
      }),
      [0, 0, 0],
    )
  })

  void it('turns the normal to the room it names first', () => {
    const map = splitRooms(flatMap())
    const portal = onlyPortalOf(map)
    const normal = normalOfPortal(portal.polygon)
    const { center } = portal.polygon
    const firstRoom = centerOfRoom(map, portal.room1)
    const secondRoom = centerOfRoom(map, portal.room2)
    const toFirst = new Vector3(firstRoom.x - center.x, firstRoom.y - center.y, firstRoom.z - center.z)
    const toSecond = new Vector3(secondRoom.x - center.x, secondRoom.y - center.y, secondRoom.z - center.z)

    assert.ok(normal.dot(toFirst) > 0)
    assert.ok(normal.dot(toSecond) < 0)
    // a wall of a flat level is vertical
    assert.ok(Math.abs(normal.y) < 0.000_001)
  })

  void it('takes the height of its options', () => {
    const map = splitRooms(flatMap())
    const portal = onlyPortalOf(map, 350)

    assert.equal(portal.polygon.max.y - portal.polygon.min.y, 350)
  })

  void it('leaves out the boundary to the outside and to the faces without a room', () => {
    const map = splitRooms(flatMap())

    // the right half goes to the outside (room 0), so the only door of the level is the line between 2 and 0: none
    map.setFaceRooms(
      map.polygons.map((polygon, index) => {
        const side = polygon.vertices[0]?.x ?? 0

        let room = 0

        if (side < BLANK_LEVEL_ORIGIN.x) {
          room = 2
        }

        return { index, room }
      }),
    )

    assert.deepEqual(generatePortalsOf(map.polygons), [])
  })
})
