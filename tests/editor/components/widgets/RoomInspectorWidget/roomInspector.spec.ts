import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import type { RoomLink } from '../../../../../src/generator/rooms.ts'
import {
  faceCountLabelOf,
  roomProblemsOf,
  roomRowsOf,
  roomUnderCrosshairOf,
} from '../../../../../src/editor/components/widgets/RoomInspectorWidget/roomInspector.ts'

/**
 * Builds a face of the test: only the room is read by the panel.
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

void describe('roomUnderCrosshairOf', () => {
  void it('reads the room of the face under the crosshair', () => {
    const level = levelOf([faceOf(4)])

    assert.equal(roomUnderCrosshairOf(level, 0), 4)
  })

  void it('gives nothing while there is no level or no face', () => {
    const level = levelOf([faceOf(4)])

    assert.equal(roomUnderCrosshairOf(undefined, 0), undefined)
    assert.equal(roomUnderCrosshairOf(level, undefined), undefined)
    assert.equal(roomUnderCrosshairOf(level, 9), undefined)
  })

  void it('gives nothing for a face without a room', () => {
    const level = levelOf([faceOf(-1)])

    assert.equal(roomUnderCrosshairOf(level, 0), undefined)
  })
})

void describe('roomProblemsOf', () => {
  void it('says nothing about a level with two rooms and an opening', () => {
    const level = levelOf([faceOf(1), faceOf(2)], [{ room1: 1, room2: 2 }])

    assert.deepEqual(roomProblemsOf(level), [])
  })

  void it('explains a level of one room, without calling it a mistake', () => {
    const problems = roomProblemsOf(levelOf([faceOf(1), faceOf(1)]))

    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'info')
    assert.match(problems[0].text, /One room/u)
  })

  void it('warns about the faces without a room', () => {
    const level = levelOf([faceOf(-1), faceOf(-1), faceOf(1), faceOf(2)], [{ room1: 1, room2: 2 }])
    const problems = roomProblemsOf(level)

    assert.deepEqual(
      problems.map((problem) => {
        return problem.kind
      }),
      ['warning'],
    )
    assert.match(problems[0].text, /2 faces/u)
  })

  void it('warns about a room no portal reaches', () => {
    const level = levelOf([faceOf(1), faceOf(2), faceOf(3)], [{ room1: 1, room2: 2 }])
    const problems = roomProblemsOf(level)

    assert.equal(problems.length, 1)
    assert.equal(problems[0].kind, 'warning')
    assert.match(problems[0].text, /room 3/u)
  })
})
