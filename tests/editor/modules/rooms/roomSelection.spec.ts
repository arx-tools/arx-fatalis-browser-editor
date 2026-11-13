import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { facesOfRoom, pickRoom, roomsOfFaces } from '../../../../src/editor/modules/rooms/roomSelection.ts'
import { selectedRooms } from '../../../../src/editor/modules/rooms/roomStore.ts'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import { levelStore } from '../../../../src/editor/modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../../src/editor/modules/selection/selectionStore.ts'
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

/**
 * Builds a level of two rooms: the first three faces are in room 2, the rest stay in room 1.
 *
 * @returns The level, ready to be read.
 */
function twoRoomMap(): ArxMap {
  const map = mapOf()

  for (const index of [0, 1, 2]) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      polygon.room = 2
    }
  }

  return map
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

void describe('pickRoom', () => {
  afterEach(() => {
    pickRoom(undefined)
    levelStore.map.value = undefined
  })

  void it('replaces the selection with the faces of the room', () => {
    levelStore.map.value = twoRoomMap()
    selectionStore.selectMany([10], 'replace')

    pickRoom(2)

    assert.deepEqual(selectionStore.polygons.value, new Set([0, 1, 2]))
    assert.deepEqual(selectedRooms.value, new Set([2]))
  })

  void it('adds the faces of the room to the selection', () => {
    levelStore.map.value = twoRoomMap()
    selectionStore.selectMany([10], 'replace')

    pickRoom(2, 'add')

    assert.deepEqual(selectionStore.polygons.value, new Set([10, 0, 1, 2]))
  })

  void it('takes the faces of the room out of the selection', () => {
    levelStore.map.value = twoRoomMap()
    selectionStore.selectMany([10, 0, 1, 2], 'replace')

    pickRoom(2, 'remove')

    assert.deepEqual(selectionStore.polygons.value, new Set([10]))
  })
})
