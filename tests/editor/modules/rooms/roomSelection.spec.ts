import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { facesOfRoom, roomsOfFaces } from '../../../../src/editor/modules/rooms/roomSelection.ts'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../src/generator/Settings.ts'

/**
 * Builds the blank level of the editor.
 *
 * @remarks
 * Every polygon of it is in room 1 (the generator puts a new level into that room), so a test that wants two rooms
 * moves some faces of the list.
 *
 * @returns The level, ready to be read.
 */
function mapOf(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

void describe('facesOfRoom', () => {
  void it('gives every face of the room, in the order of the level', () => {
    const map = mapOf()
    const faces = facesOfRoom(map, 1)

    assert.equal(faces.length, map.polygons.length)
    assert.deepEqual(
      faces,
      map.polygons.map((_polygon, index) => {
        return index
      }),
    )
  })

  void it('gives nothing for a room without a face', () => {
    assert.deepEqual(facesOfRoom(mapOf(), 7), [])
  })

  void it('follows an edit that moves a face out of the room', () => {
    const map = mapOf()
    const moved = map.polygons[3]

    if (moved !== undefined) {
      moved.room = 2
    }

    assert.equal(facesOfRoom(map, 1).length, map.polygons.length - 1)
    assert.deepEqual(facesOfRoom(map, 2), [3])
  })
})

void describe('roomsOfFaces', () => {
  void it('gives the rooms the selected faces are in', () => {
    const map = mapOf()

    assert.deepEqual(roomsOfFaces(map, new Set([0, 1, 2])), new Set([1]))
  })

  void it('gives every room of a selection that spans them', () => {
    const map = mapOf()

    if (map.polygons[0] !== undefined) {
      map.polygons[0].room = 5
    }

    assert.deepEqual(roomsOfFaces(map, new Set([0, 1, 2])), new Set([5, 1]))
  })

  void it('gives no room for an empty selection', () => {
    assert.deepEqual(roomsOfFaces(mapOf(), new Set()), new Set())
  })

  void it('skips a face the level does not have', () => {
    assert.deepEqual(roomsOfFaces(mapOf(), new Set([99_999])), new Set())
  })
})
