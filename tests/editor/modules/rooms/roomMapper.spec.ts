import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../src/editor/modules/level/blankLevel.ts'
import { MAX_ROOM_ID, nextRoomIdOf, roomTargetsOf } from '../../../../src/editor/modules/rooms/roomMapper.ts'
import { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../src/generator/Settings.ts'

/**
 * Builds the blank level of the editor, whose faces are all in room 1.
 *
 * @returns The level, ready to be read.
 */
function mapOf(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * Puts one face into another room.
 *
 * @param map The level to edit.
 * @param index The face to move.
 * @param room The room it takes.
 */
function moveFace(map: ArxMap, index: number, room: number): void {
  const polygon = map.polygons[index]

  if (polygon !== undefined) {
    polygon.room = room
  }
}

void describe('roomTargetsOf', () => {
  void it('counts the faces of every room, by id', () => {
    const map = mapOf()

    moveFace(map, 0, 2)
    moveFace(map, 1, 2)
    moveFace(map, 2, 7)

    assert.deepEqual(roomTargetsOf(map), [
      { room: 1, faceCount: map.polygons.length - 3 },
      { room: 2, faceCount: 2 },
      { room: 7, faceCount: 1 },
    ])
  })

  void it('leaves the faces without a room out', () => {
    const map = mapOf()

    moveFace(map, 0, -1)

    assert.deepEqual(
      roomTargetsOf(map).map((target) => {
        return target.room
      }),
      [1],
    )
  })
})

void describe('nextRoomIdOf', () => {
  void it('gives the id after the highest room', () => {
    const map = mapOf()

    moveFace(map, 0, 5)

    assert.equal(nextRoomIdOf(map), 6)
  })

  void it('gives nothing when the level is at the last id', () => {
    const map = mapOf()

    moveFace(map, 0, MAX_ROOM_ID)

    assert.equal(nextRoomIdOf(map), undefined)
  })
})
