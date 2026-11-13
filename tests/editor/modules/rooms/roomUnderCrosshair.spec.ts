import assert from 'node:assert/strict'
import { afterEach, before, describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import type { ArxMap } from '../../../../src/generator/ArxMap.ts'
import type { RoomLink } from '../../../../src/generator/rooms.ts'
import { crosshairStore } from '../../../../src/editor/modules/crosshair/crosshairStore.ts'
import { levelStore } from '../../../../src/editor/modules/level/edit/levelStore.ts'
import { litRooms, selectRoom } from '../../../../src/editor/modules/rooms/roomStore.ts'
import {
  currentRoom,
  roomUnderCrosshairOf,
  startCurrentRoom,
} from '../../../../src/editor/modules/rooms/roomUnderCrosshair.ts'

before(() => {
  startCurrentRoom()
})

/**
 * Builds a face of the test: only the room is read by the readout.
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

void describe('currentRoom', () => {
  afterEach(() => {
    levelStore.map.value = undefined
    crosshairStore.polygon.value = undefined
  })

  void it('follows the face the crosshair store holds', () => {
    levelStore.map.value = levelOf([faceOf(4), faceOf(7)])
    crosshairStore.polygon.value = 1

    assert.equal(currentRoom.value, 7)
  })

  void it('is empty for a face without a room', () => {
    levelStore.map.value = levelOf([faceOf(4), faceOf(-1)])
    crosshairStore.polygon.value = 1

    assert.equal(currentRoom.value, undefined)
  })
})

void describe('litRooms', () => {
  afterEach(() => {
    selectRoom(undefined)
    levelStore.map.value = undefined
    crosshairStore.polygon.value = undefined
  })

  void it('adds the room under the crosshair to the selected ones', () => {
    levelStore.map.value = levelOf([faceOf(3), faceOf(7)])
    crosshairStore.polygon.value = 1
    selectRoom(3)

    assert.deepEqual(litRooms.value, new Set([3, 7]))
  })
})
