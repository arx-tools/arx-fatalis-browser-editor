import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { clearRoomHover, hoverRoom, litRooms, selectRoom } from '../../../../src/editor/modules/rooms/roomStore.ts'

void describe('litRooms', () => {
  beforeEach(() => {
    selectRoom(undefined)
    clearRoomHover()
  })

  void it('is empty when nothing is picked or hovered', () => {
    assert.deepEqual(litRooms.value, new Set())
  })

  void it('holds the room of the selection', () => {
    selectRoom(3)

    assert.deepEqual(litRooms.value, new Set([3]))
  })

  void it('holds the room under the pointer while it is there', () => {
    hoverRoom(5)

    assert.deepEqual(litRooms.value, new Set([5]))

    hoverRoom(undefined)

    assert.deepEqual(litRooms.value, new Set())
  })

  void it('holds the hovered room beside the selection', () => {
    selectRoom(3)
    hoverRoom(5)

    assert.deepEqual(litRooms.value, new Set([3, 5]))
  })

  void it('is empty again after the hover is cleared', () => {
    selectRoom(3)
    hoverRoom(5)
    clearRoomHover()

    assert.deepEqual(litRooms.value, new Set([3]))
  })
})
