import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import type { RoomLink } from '../../../../../src/generator/rooms.ts'
import { roomProblemsOf } from '../../../../../src/editor/components/widgets/RoomInspectorWidget/roomInspector.ts'

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
