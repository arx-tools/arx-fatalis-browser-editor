import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  checkedRooms,
  clearRoomHighlight,
  hoverRoom,
  litRooms,
  selectRoom,
  toggleCheckedRoom,
} from '../../../../src/editor/modules/rooms/roomStore.ts'

void describe('litRooms', () => {
  beforeEach(() => {
    selectRoom(undefined)
    clearRoomHighlight()
  })

  void it('is empty when nothing is picked, checked or hovered', () => {
    assert.deepEqual(litRooms.value, new Set())
  })

  void it('holds the room of the selection', () => {
    selectRoom(3)

    assert.deepEqual(litRooms.value, new Set([3]))
  })

  void it('holds the checkboxes beside the selection', () => {
    selectRoom(3)
    checkedRooms.value = new Set([7, 9])

    assert.deepEqual(litRooms.value, new Set([3, 7, 9]))
  })

  void it('holds the room under the pointer while it is there', () => {
    hoverRoom(5)

    assert.deepEqual(litRooms.value, new Set([5]))

    hoverRoom(undefined)

    assert.deepEqual(litRooms.value, new Set())
  })

  void it('is empty again after the highlight is cleared', () => {
    selectRoom(3)
    checkedRooms.value = new Set([7])
    hoverRoom(5)
    clearRoomHighlight()

    assert.deepEqual(litRooms.value, new Set([3]))
    assert.deepEqual(checkedRooms.value, new Set())
  })
})

void describe('toggleCheckedRoom', () => {
  beforeEach(() => {
    clearRoomHighlight()
  })

  void it('adds the room to the checked ones', () => {
    toggleCheckedRoom(4)

    assert.deepEqual(checkedRooms.value, new Set([4]))
  })

  void it('takes the room out when it is checked again', () => {
    toggleCheckedRoom(4)
    toggleCheckedRoom(7)
    toggleCheckedRoom(4)

    assert.deepEqual(checkedRooms.value, new Set([7]))
  })
})
