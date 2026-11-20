import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  hasRoomNamesOfAnotherVersion,
  readStoredRoomNames,
  roomNamesOfValue,
  roomNamesOfVersion,
  seedRoomNamesOf,
  writeRoomNamesOf,
} from '../../../../src/editor/modules/rooms/roomNamesStorage.ts'
import type { StorageLike } from '../../../../src/editor/modules/persistedRef/storage.ts'

/**
 * The fingerprint of the level of the tests.
 */
const FINGERPRINT = '1a2b3c4d:2f'

/**
 * The fingerprint of another version of the same level.
 */
const OTHER_FINGERPRINT = '5e6f7a8b:40'

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

    writeRoomNamesOf('arx:8', FINGERPRINT, { '1': 'The yard' }, storage)
    seedRoomNamesOf('blank:flat', FINGERPRINT, { '2': 'Floor' }, storage)

    assert.deepEqual(readStoredRoomNames(storage), {
      'arx:8': { versions: { [FINGERPRINT]: { '1': 'The yard' } } },
      'blank:flat': { versions: { [FINGERPRINT]: { '2': 'Floor' } } },
    })
  })

  void it('reads the names of two versions of a level apart', () => {
    const { storage } = fakeStorage()

    writeRoomNamesOf('arx:1', FINGERPRINT, { '1': 'The final yard' }, storage)
    writeRoomNamesOf('arx:1', OTHER_FINGERPRINT, { '1': 'The demo yard' }, storage)

    const map = readStoredRoomNames(storage)['arx:1']

    assert.deepEqual(roomNamesOfVersion(map, FINGERPRINT), { '1': 'The final yard' })
    assert.deepEqual(roomNamesOfVersion(map, OTHER_FINGERPRINT), { '1': 'The demo yard' })
    assert.equal(hasRoomNamesOfAnotherVersion(map, FINGERPRINT), true)
  })

  void it('reads nothing of a version the level was not named on', () => {
    const { storage } = fakeStorage()

    writeRoomNamesOf('arx:1', FINGERPRINT, { '1': 'The yard' }, storage)

    const map = readStoredRoomNames(storage)['arx:1']

    assert.equal(roomNamesOfVersion(map, OTHER_FINGERPRINT), undefined)
    assert.equal(hasRoomNamesOfAnotherVersion(map, FINGERPRINT), false)
  })

  void it('reads nothing from a value of another version', () => {
    const { storage } = fakeStorage()

    storage.setItem('roomNames', JSON.stringify({ version: 1, maps: { 'arx:1': { '1': 'The yard' } } }))

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
