import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  groupsOfVersion,
  hasGroupsOfAnotherVersion,
  readStoredGroups,
  seedFaceGroupsOf,
  withGroupsOfVersion,
  writeStoredGroups,
  type StoredGroups,
} from '../../../../src/editor/modules/groups/groupStorage.ts'
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

/**
 * The stored value of the levels of the test, with the shape of this build.
 *
 * @param maps The levels to write.
 *
 * @returns The value the storage holds.
 */
function storedValue(maps: unknown): string {
  return JSON.stringify({ version: 2, maps })
}

void describe('readStoredGroups', () => {
  void it('reads the groups of a level with the next id of its groups', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'blank:flat': {
          title: 'Blank: Flat Plane',
          versions: {
            [FINGERPRINT]: { nextId: 3, groups: [{ id: 2, name: 'the floor', faces: [4, 5] }] },
          },
        },
      }),
    )

    const groups = readStoredGroups(storage)

    assert.deepEqual(groups['blank:flat'], {
      title: 'Blank: Flat Plane',
      versions: {
        [FINGERPRINT]: { nextId: 3, groups: [{ id: 2, name: 'the floor', faces: [4, 5] }] },
      },
    })
  })

  void it('reads two versions of a level apart', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:1': {
          title: 'Arx: Level 1',
          versions: {
            [FINGERPRINT]: { nextId: 2, groups: [{ id: 1, name: 'final', faces: [0] }] },
            [OTHER_FINGERPRINT]: { nextId: 2, groups: [{ id: 1, name: 'demo', faces: [7] }] },
          },
        },
      }),
    )

    const map = readStoredGroups(storage)['arx:1']

    assert.deepEqual(groupsOfVersion(map, FINGERPRINT)?.groups, [{ id: 1, name: 'final', faces: [0] }])
    assert.deepEqual(groupsOfVersion(map, OTHER_FINGERPRINT)?.groups, [{ id: 1, name: 'demo', faces: [7] }])
    assert.equal(hasGroupsOfAnotherVersion(map, FINGERPRINT), true)
  })

  void it('reads nothing of a version the level was not grouped on', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:1': {
          title: 'Arx: Level 1',
          versions: { [FINGERPRINT]: { nextId: 2, groups: [{ id: 1, name: 'final', faces: [0] }] } },
        },
      }),
    )

    const map = readStoredGroups(storage)['arx:1']

    assert.equal(groupsOfVersion(map, OTHER_FINGERPRINT), undefined)
    assert.equal(hasGroupsOfAnotherVersion(map, FINGERPRINT), false)
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

    // the version before the fingerprints: the groups of a level can not be told from the ones of another file
    storage.setItem(
      'faceGroups',
      JSON.stringify({
        version: 1,
        maps: {
          'arx:1': { title: 'Arx: Level 1', nextId: 2, groups: [{ id: 1, name: 'final', faces: [0] }] },
        },
      }),
    )

    assert.deepEqual(readStoredGroups(storage), {})
  })

  void it('skips a group the build does not know, and keeps the level', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:8': {
          title: 'Arx: Level 8',
          versions: {
            [FINGERPRINT]: {
              nextId: 2,
              groups: [
                { id: 1, name: 'ok', faces: [0] },
                { id: 'nope', name: 'bad', faces: [1] },
              ],
            },
          },
        },
      }),
    )

    assert.deepEqual(groupsOfVersion(readStoredGroups(storage)['arx:8'], FINGERPRINT)?.groups, [
      { id: 1, name: 'ok', faces: [0] },
    ])
  })

  void it('puts the next id after the last group, whatever the value said', () => {
    const { storage } = fakeStorage()

    storage.setItem(
      'faceGroups',
      storedValue({
        'arx:8': {
          title: 'Arx: Level 8',
          versions: { [FINGERPRINT]: { nextId: 1, groups: [{ id: 7, name: 'seven', faces: [] }] } },
        },
      }),
    )

    assert.equal(groupsOfVersion(readStoredGroups(storage)['arx:8'], FINGERPRINT)?.nextId, 8)
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

void describe('withGroupsOfVersion', () => {
  void it('puts the groups of a version beside the groups of the other ones', () => {
    const map = withGroupsOfVersion(
      {
        title: 'Arx: Level 1',
        versions: { [FINGERPRINT]: { nextId: 2, groups: [{ id: 1, name: 'final', faces: [0] }] } },
      },
      'Arx: Level 1',
      OTHER_FINGERPRINT,
      { nextId: 3, groups: [{ id: 2, name: 'demo', faces: [7] }] },
    )

    assert.deepEqual(map.versions[FINGERPRINT]?.groups, [{ id: 1, name: 'final', faces: [0] }])
    assert.deepEqual(map.versions[OTHER_FINGERPRINT]?.groups, [{ id: 2, name: 'demo', faces: [7] }])
  })

  void it('makes the level of a version it has not seen', () => {
    assert.deepEqual(withGroupsOfVersion(undefined, 'Arx: Level 1', FINGERPRINT, { nextId: 2, groups: [] }), {
      title: 'Arx: Level 1',
      versions: { [FINGERPRINT]: { nextId: 2, groups: [] } },
    })
  })
})

void describe('writeStoredGroups', () => {
  void it('writes the value the reader reads back', () => {
    const { storage } = fakeStorage()
    const groups: StoredGroups = {
      'blank:flat': {
        title: 'Blank: Flat Plane',
        versions: {
          [FINGERPRINT]: { nextId: 2, groups: [{ id: 1, name: 'floor', faces: [0, 1] }] },
        },
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

void describe('seedFaceGroupsOf', () => {
  void it('seeds the groups of a file beside the groups of the other versions', () => {
    const { storage } = fakeStorage()

    seedFaceGroupsOf(
      {
        id: 'arx:1',
        fingerprint: FINGERPRINT,
        title: 'Arx: Level 1',
        version: { nextId: 2, groups: [{ id: 1, name: 'final', faces: [0] }] },
      },
      storage,
    )
    seedFaceGroupsOf(
      {
        id: 'arx:1',
        fingerprint: OTHER_FINGERPRINT,
        title: 'Arx: Level 1',
        version: { nextId: 3, groups: [{ id: 2, name: 'demo', faces: [7] }] },
      },
      storage,
    )

    const map = readStoredGroups(storage)['arx:1']

    assert.equal(map?.title, 'Arx: Level 1')
    assert.deepEqual(groupsOfVersion(map, FINGERPRINT)?.groups, [{ id: 1, name: 'final', faces: [0] }])
    assert.deepEqual(groupsOfVersion(map, OTHER_FINGERPRINT)?.groups, [{ id: 2, name: 'demo', faces: [7] }])
  })
})
