import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  readStoredGroups,
  writeStoredGroups,
  type StoredGroups,
} from '../../../../src/editor/modules/groups/groupStorage.ts'
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

/**
 * The stored value of one level, with the shape of this build.
 *
 * @param maps The levels to write.
 *
 * @returns The value the storage holds.
 */
function storedValue(maps: unknown): string {
  return JSON.stringify({ version: 1, maps })
}

void describe('readStoredGroups', () => {
  void it('reads the groups of a level with the next id of its groups', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'blank:flat': {
          title: 'Blank: Flat Plane',
          nextId: 3,
          groups: [{ id: 2, name: 'the floor', faces: [4, 5] }],
        },
      }),
    )

    const groups = readStoredGroups(storage)

    assert.deepEqual(groups['blank:flat'], {
      title: 'Blank: Flat Plane',
      nextId: 3,
      groups: [{ id: 2, name: 'the floor', faces: [4, 5] }],
    })
  })

  void it('reads nothing from a storage without the value', () => {
    const { storage } = fakeStorage()

    assert.deepEqual(readStoredGroups(storage), {})
  })

  void it('reads nothing from a value that is not json', () => {
    const { storage } = fakeStorage()

    storage.setItem('faceGroups', '{')

    assert.deepEqual(readStoredGroups(storage), {})
  })

  void it('reads nothing from a value of another version', () => {
    const { storage } = fakeStorage()

    storage.setItem('faceGroups', JSON.stringify({ version: 2, maps: {} }))

    assert.deepEqual(readStoredGroups(storage), {})
  })

  void it('skips a group the build does not know, and keeps the level', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:8': {
          title: 'Arx: Level 8',
          nextId: 2,
          groups: [
            { id: 1, name: 'ok', faces: [0] },
            { id: 'nope', name: 'bad', faces: [1] },
          ],
        },
      }),
    )

    assert.deepEqual(readStoredGroups(storage)['arx:8']?.groups, [{ id: 1, name: 'ok', faces: [0] }])
  })

  void it('puts the next id after the last group, whatever the value said', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:8': { title: 'Arx: Level 8', nextId: 1, groups: [{ id: 7, name: 'seven', faces: [] }] },
      }),
    )

    assert.equal(readStoredGroups(storage)['arx:8']?.nextId, 8)
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

    assert.deepEqual(readStoredGroups(storage), {})
  })
})

void describe('writeStoredGroups', () => {
  void it('writes the value the reader reads back', () => {
    const { storage } = fakeStorage()
    const groups: StoredGroups = {
      'blank:flat': {
        title: 'Blank: Flat Plane',
        nextId: 2,
        groups: [{ id: 1, name: 'floor', faces: [0, 1] }],
      },
    }

    writeStoredGroups(groups, storage)

    assert.deepEqual(readStoredGroups(storage), groups)
  })

  void it('keeps the session going when the storage refuses the write', () => {
    const storage: StorageLike = {
      getItem: (): string | null => {
        return null
      },
      setItem: (): void => {
        throw new Error('full')
      },
      removeItem: (): void => {
        throw new Error('full')
      },
    }

    writeStoredGroups({}, storage)

    // the storage refused the value, and the reader has none
    assert.equal(readStoredGroups(storage)['blank:flat'], undefined)
  })
})
