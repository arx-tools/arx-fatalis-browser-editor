import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { isFlatLevel, syncGeneratedPortals } from '../../../../../src/editor/modules/level/edit/generatedPortals.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { generatePortalsOf } from '../../../../../src/generator/portals.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * Builds the flat level of the editor: an 11×11 floor of tiles, all in room 1.
 *
 * @returns The level, ready to be read.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))

  // the blank file has the rooms 0 and 1: the room 2 of the test needs a record for its portal list
  map.fts.rooms.push({ portals: [], polygons: [] })

  return map
}

/**
 * Splits the flat level into two rooms along a line of the grid.
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

      if (side < 600) {
        room = 2
      }

      return { index, room }
    }),
  )

  return map
}

void describe('isFlatLevel', () => {
  void it('reads the blank floor as flat', () => {
    assert.equal(isFlatLevel(flatMap()), true)
  })

  void it('reads a level with a vertex above the floor as a 3D level', () => {
    const map = flatMap()

    map.polygons[0].vertices[0].y = 100

    assert.equal(isFlatLevel(map), false)
  })
})

void describe('syncGeneratedPortals', () => {
  void it('builds the portals of a flat level from its rooms', () => {
    const map = splitRooms(flatMap())

    assert.equal(syncGeneratedPortals(map), true)
    assert.equal(map.fts.portals.length, 1)
    // the portal is in the list of both rooms, with the index of the portal
    assert.deepEqual(map.fts.rooms[1].portals, [0])
    assert.deepEqual(map.fts.rooms[2].portals, [0])
    // the statistics follow the portals, so a widget that reads them says the new number
    assert.equal(map.statistics.portalCount, 1)
  })

  void it('does nothing when the rooms did not change the portals', () => {
    const map = splitRooms(flatMap())

    syncGeneratedPortals(map)
    assert.equal(syncGeneratedPortals(map), false)
    assert.equal(map.fts.portals.length, 1)
  })

  void it('leaves the portals a flat level brought with it alone', () => {
    const source = splitRooms(flatMap())
    const map = flatMap()

    map.fts.portals = generatePortalsOf(source.polygons)

    assert.equal(syncGeneratedPortals(map), false)
    assert.equal(map.fts.portals.length, 1)
  })

  void it('takes a level whose portals are the generated ones as its own', () => {
    const source = splitRooms(flatMap())

    syncGeneratedPortals(source)

    const map = splitRooms(flatMap())

    map.fts.portals = source.fts.portals

    // the portals are the ones of the rooms, so the map is one this module may keep in step
    assert.equal(syncGeneratedPortals(map), false)

    // a new room edit takes the portals away: the whole floor becomes one room
    map.setFaceRooms(
      map.polygons.map((_polygon, index) => {
        return { index, room: 1 }
      }),
    )

    assert.equal(syncGeneratedPortals(map), true)
    assert.equal(map.fts.portals.length, 0)
  })

  void it('does nothing on a 3D level', () => {
    const map = splitRooms(flatMap())

    map.polygons[0].vertices[0].y = 100

    assert.equal(syncGeneratedPortals(map), false)
    assert.equal(map.fts.portals.length, 0)
  })

  void it('gives no portal to a level with one room', () => {
    const map = flatMap()

    assert.equal(syncGeneratedPortals(map), false)
    assert.equal(map.fts.portals.length, 0)
  })
})
