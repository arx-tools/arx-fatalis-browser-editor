import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../src/generator/ArxMap.ts'
import type { RoomLink } from '../../../../src/generator/rooms.ts'
import {
  faceCountLabelOf,
  filteredRoomRows,
  roomRowsOf,
  roomSearchTextOf,
  type RoomRow,
} from '../../../../src/editor/modules/rooms/roomList.ts'

/**
 * Builds a face of the test: only the room is read by the list.
 *
 * @param room Which area it belongs to.
 *
 * @returns A face that says nothing but where it belongs.
 */
function faceOf(room: number): ArxPolygon {
  return { room } as unknown as ArxPolygon
}

/**
 * Builds a level of the test, from the faces and the portals it should have.
 *
 * @param polygons The faces it has.
 * @param portals The links between them, none by default.
 *
 * @returns A level with those faces and links.
 */
function levelOf(polygons: readonly ArxPolygon[], portals: readonly RoomLink[] = []): ArxMap {
  return { polygons, fts: { portals } } as unknown as ArxMap
}

/**
 * Builds a row of the test: only the id and the name of the room are read by a search.
 *
 * @param room The id of the room.
 *
 * @returns A row with no colour and no face.
 */
function rowOf(room: number): RoomRow {
  return { room, faceCount: 0, color: '#000000' }
}

void describe('roomRowsOf', () => {
  void it('lists the rooms of the level with their faces and their colour', () => {
    const level = levelOf([faceOf(2), faceOf(1), faceOf(2)], [{ room1: 1, room2: 2 }])
    const rows = roomRowsOf(level, 'arx:2')

    assert.deepEqual(
      rows.map((row) => {
        return { room: row.room, faceCount: row.faceCount }
      }),
      [
        { room: 1, faceCount: 1 },
        { room: 2, faceCount: 2 },
      ],
    )
    assert.notEqual(rows[0].color, rows[1].color)
  })

  void it('gives the same rooms the same colours as the room map of the level', () => {
    const level = levelOf([faceOf(1), faceOf(2)], [{ room1: 1, room2: 2 }])
    const first = roomRowsOf(level, 'arx:2')
    const second = roomRowsOf(level, 'arx:2')

    assert.deepEqual(
      first.map((row) => {
        return row.color
      }),
      second.map((row) => {
        return row.color
      }),
    )
  })

  void it('lists no room for a level without a face', () => {
    assert.deepEqual(roomRowsOf(levelOf([]), 'arx:2'), [])
  })
})

void describe('faceCountLabelOf', () => {
  void it('writes the count with the unit the faces of a level are counted in', () => {
    assert.equal(faceCountLabelOf(1571), '1 571 faces')
  })

  void it('says one face in the singular', () => {
    assert.equal(faceCountLabelOf(1), '1 face')
  })
})

void describe('roomSearchTextOf', () => {
  void it('reads the number of the room and its name', () => {
    assert.equal(roomSearchTextOf(rowOf(12)), 'room 12 Unnamed area')
  })
})

void describe('filteredRoomRows', () => {
  void it('lets every row through without a search', () => {
    const rows = [rowOf(1), rowOf(2)]

    assert.deepEqual(filteredRoomRows(rows, ''), rows)
  })

  void it('finds a room by its number, and keeps the order of the list', () => {
    const rows = [rowOf(1), rowOf(12), rowOf(21)]
    const found = filteredRoomRows(rows, 'room 2')

    assert.deepEqual(
      found.map((row) => {
        return row.room
      }),
      [12, 21],
    )
  })

  void it('reads every word of the search on its own', () => {
    const rows = [rowOf(1), rowOf(12)]

    assert.deepEqual(
      filteredRoomRows(rows, '  room   1 ').map((row) => {
        return row.room
      }),
      [1, 12],
    )
  })

  void it('lets no row through when a word is not in any of them', () => {
    assert.deepEqual(filteredRoomRows([rowOf(1), rowOf(2)], 'room 3'), [])
  })
})
