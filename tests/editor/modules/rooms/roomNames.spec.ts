import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  nameOf,
  renameRoom,
  roomNameOf,
  roomNames,
  roomNamesJson,
  UNNAMED_ROOM,
} from '../../../../src/editor/modules/rooms/roomNames.ts'

void describe('renameRoom', () => {
  beforeEach(() => {
    roomNames.value = new Map()
  })

  void it('names a room', () => {
    renameRoom(35, "  Maria's shop  ")

    assert.equal(roomNameOf(35), "Maria's shop")
    assert.equal(nameOf(35), "Maria's shop")
  })

  void it('calls a room without a name by the text of the nameless ones', () => {
    assert.equal(roomNameOf(7), undefined)
    assert.equal(nameOf(7), UNNAMED_ROOM)
  })

  void it('takes the name away when the field is empty', () => {
    renameRoom(35, 'Maria')
    renameRoom(35, ' ')

    assert.equal(roomNameOf(35), undefined)
  })
})

void describe('roomNamesJson', () => {
  beforeEach(() => {
    roomNames.value = new Map()
  })

  void it('writes the names by the id of the room as a text', () => {
    renameRoom(3, 'Hall')
    renameRoom(35, "Maria's shop")

    assert.deepEqual(roomNamesJson(), { 3: 'Hall', 35: "Maria's shop" })
  })

  void it('writes nothing when the level has no name', () => {
    assert.equal(roomNamesJson(), undefined)
  })
})
