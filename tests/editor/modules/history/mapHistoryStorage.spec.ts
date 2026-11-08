import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDeleteFacesRecord } from '../../../../src/editor/modules/history/records.ts'
import {
  dropStoredHistory,
  readStoredHistory,
  writeStoredHistory,
} from '../../../../src/editor/modules/history/mapHistoryStorage.ts'
import {
  clearPersistenceProblems,
  persistenceProblems,
} from '../../../../src/editor/modules/persistedRef/persistenceProblems.ts'
import type { StorageLike } from '../../../../src/editor/modules/persistedRef/storage.ts'

/**
 * A storage of the test: the three calls the module uses, over a map.
 */
interface FakeStorage extends StorageLike {
  /**
   * The values it holds.
   */
  readonly values: Map<string, string>
}

/**
 * Builds a storage of the test.
 *
 * @returns The empty storage.
 */
function fakeStorage(): FakeStorage {
  const values = new Map<string, string>()

  return {
    values,
    getItem: (key: string): string | null => {
      return values.get(key) ?? null
    },
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
    removeItem: (key: string): void => {
      values.delete(key)
    },
  }
}

/**
 * Builds the step of the test.
 *
 * @param face The face it takes out.
 *
 * @returns A step that only takes that face away.
 */
function recordOf(face: number): ReturnType<typeof createDeleteFacesRecord> {
  return createDeleteFacesRecord([face])
}

void describe('mapHistoryStorage', () => {
  void it('writes and reads the steps of a map', () => {
    const storage = fakeStorage()

    writeStoredHistory(
      'arx:8',
      { fingerprint: 'abcd1234:10', records: [recordOf(3), recordOf(7)], position: 2 },
      storage,
    )

    assert.deepEqual(readStoredHistory('arx:8', storage), {
      fingerprint: 'abcd1234:10',
      records: [recordOf(3), recordOf(7)],
      position: 2,
    })
  })

  void it('keeps the steps taken back, and the position of the line', () => {
    // two steps, the second one taken back: the reload has to bring the redo too
    const storage = fakeStorage()

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(3), recordOf(7)], position: 1 }, storage)

    assert.deepEqual(readStoredHistory('arx:8', storage), {
      fingerprint: 'aaaa:1',
      records: [recordOf(3), recordOf(7)],
      position: 1,
    })
  })

  void it('keeps a line of steps that is entirely taken back', () => {
    // every step is undone: the level is the one of its files, but the redo of the author is still theirs
    const storage = fakeStorage()

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(3)], position: 0 }, storage)

    assert.deepEqual(readStoredHistory('arx:8', storage), {
      fingerprint: 'aaaa:1',
      records: [recordOf(3)],
      position: 0,
    })
  })

  void it('keeps every map under its own key', () => {
    const storage = fakeStorage()

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(1)], position: 1 }, storage)
    writeStoredHistory('arx:2', { fingerprint: 'bbbb:1', records: [recordOf(2)], position: 1 }, storage)

    assert.equal(readStoredHistory('arx:8', storage)?.records[0].kind, 'deleteFaces')
    assert.equal(storage.values.has('mapHistory:arx:8'), true)
    assert.equal(storage.values.has('mapHistory:arx:2'), true)
  })

  void it('reads nothing for a map that was not written', () => {
    assert.equal(readStoredHistory('arx:8', fakeStorage()), undefined)
  })

  void it('forgets a map when its steps are gone', () => {
    const storage = fakeStorage()

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(1)], position: 1 }, storage)
    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [], position: 0 }, storage)

    assert.equal(readStoredHistory('arx:8', storage), undefined)
    assert.equal(storage.values.has('mapHistory:arx:8'), false)
  })

  void it('drops a map on request', () => {
    const storage = fakeStorage()

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(1)], position: 1 }, storage)
    dropStoredHistory('arx:8', storage)

    assert.equal(readStoredHistory('arx:8', storage), undefined)
  })

  void it('reads the value of the version before the position as a line applied to its end', () => {
    // the older build kept only the steps on the level: all of them are applied
    const storage = fakeStorage()

    storage.setItem('mapHistory:arx:8', JSON.stringify({ version: 1, fingerprint: 'aaaa:1', records: [recordOf(1)] }))

    assert.deepEqual(readStoredHistory('arx:8', storage), {
      fingerprint: 'aaaa:1',
      records: [recordOf(1)],
      position: 1,
    })
  })

  void it('drops a value another build wrote', () => {
    // a value of another version says nothing about this level: it is dropped instead of being guessed at
    const storage = fakeStorage()

    storage.setItem('mapHistory:arx:8', JSON.stringify({ version: 99, fingerprint: 'aaaa:1', records: [] }))

    assert.equal(readStoredHistory('arx:8', storage), undefined)
    assert.equal(storage.values.has('mapHistory:arx:8'), false)
  })

  void it('drops a broken value', () => {
    const storage = fakeStorage()

    storage.setItem('mapHistory:arx:8', 'not json')

    assert.equal(readStoredHistory('arx:8', storage), undefined)
    assert.equal(storage.values.has('mapHistory:arx:8'), false)
  })

  void it('keeps the last maps and drops the oldest', () => {
    const storage = fakeStorage()

    for (let level = 1; level <= 9; level++) {
      writeStoredHistory(
        `arx:${String(level)}`,
        { fingerprint: `aaaa:${String(level)}`, records: [recordOf(level)], position: 1 },
        storage,
      )
    }

    const stored = storage.values
      .keys()
      .filter((key) => {
        return key.startsWith('mapHistory:arx:')
      })
      .toArray()

    assert.equal(readStoredHistory('arx:1', storage), undefined)
    assert.notEqual(readStoredHistory('arx:9', storage), undefined)
    assert.equal(stored.length, 8)
  })

  void it('says so when the storage refuses the write', () => {
    const storage = fakeStorage()

    clearPersistenceProblems()

    storage.setItem = (): void => {
      throw new Error('blocked')
    }

    writeStoredHistory('arx:8', { fingerprint: 'aaaa:1', records: [recordOf(1)], position: 1 }, storage)

    assert.deepEqual(
      persistenceProblems.value.map((problem) => {
        return [problem.key, problem.target]
      }),
      [['mapHistory', 'localStorage']],
    )
  })
})
