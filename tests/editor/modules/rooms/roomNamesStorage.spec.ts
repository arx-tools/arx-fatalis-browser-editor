import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  readStoredRoomNames,
  roomNamesOfValue,
  seedRoomNamesOf,
  writeRoomNamesOf,
} from '../../../../src/editor/modules/rooms/roomNamesStorage.ts'
import type { StorageLike } from '../../../../src/editor/modules/persistedRef/storage.ts'

/**
 * A storage of the test, in memory.
 *
 * @returns The storage and the values behind it.
 */
function fakeStorage(): { storage: StorageLike; values: Map<string, string> } {
  const values = new Map<string, string>()

  return {
    values,
    storage: {
      getItem: (key: string): string | null => {
        return values.get(key) ?? null
      },
      setItem: (key: string, value: string): void => {
        values.set(key, value)
      },
      removeItem: (key: string): void => {
        values.delete(key)
      },
    },
  }
}

void describe('roomNamesOfValue', () => {
  void it('keeps the names of the rooms with a whole id and a text', () => {
    assert.deepEqual(roomNamesOfValue({ '1': 'The yard', '12': 'Hall' }), { '1': 'The yard', '12': 'Hall' })
  })

  void it('drops a name of another shape, and an empty one', () => {
    assert.deepEqual(roomNamesOfValue({ '1': 'The yard', nope: 'Hall', '2': '  ', '3': 4 }), { '1': 'The yard' })
  })

  void it('reads nothing from a value that is not a map', () => {
    assert.equal(roomNamesOfValue(undefined), undefined)
    assert.equal(roomNamesOfValue(['The yard']), undefined)
  })
})

void describe('readStoredRoomNames', () => {
  void it('reads the names of every level', () => {
    const { storage } = fakeStorage()

    writeRoomNamesOf('arx:8', { '1': 'The yard' }, storage)
    seedRoomNamesOf('blank:flat', { '2': 'Floor' }, storage)

    assert.deepEqual(readStoredRoomNames(storage), {
      'arx:8': { '1': 'The yard' },
      'blank:flat': { '2': 'Floor' },
    })
  })

  void it('reads nothing from a value of another version', () => {
    const { storage } = fakeStorage()

    storage.setItem('roomNames', JSON.stringify({ version: 2, maps: {} }))

    assert.deepEqual(readStoredRoomNames(storage), {})
  })

  void it('reads nothing when the storage refuses the value', () => {
    const storage: StorageLike = {
      getItem: (): string => {
        throw new Error('blocked')
      },
      setItem: (): void => {
        throw new Error('blocked')
      },
      removeItem: (): void => {
        throw new Error('blocked')
      },
    }

    assert.deepEqual(readStoredRoomNames(storage), {})
  })
})
