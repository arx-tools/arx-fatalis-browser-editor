import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HistoryRecord } from '../../../../src/editor/modules/history/records.ts'
import {
  availableMapIdOf,
  editedMapIdsOf,
  mapIdFromUrl,
  mapIdOfSlug,
  mapSlugOf,
  rememberMapId,
  storedMapId,
} from '../../../../src/editor/modules/level/maps.ts'
import type { UrlAdapter } from '../../../../src/editor/modules/persistedRef/url.ts'

/**
 * A step of the test: a delete of the first face.
 *
 * @returns The record of the step.
 */
function record(): HistoryRecord {
  return { version: 1, kind: 'deleteFaces', faces: [0] }
}

/**
 * A url adapter of the test, with a fixed query string.
 *
 * @param search The query string the adapter reads.
 *
 * @returns The adapter, which writes nowhere.
 */
function urlOf(search: string): UrlAdapter {
  return {
    read: (): string => {
      return search
    },
    write: (): void => {
      // the test only reads
    },
  }
}

void describe('availableMapIdOf', () => {
  void it('keeps the map when the list has it', () => {
    assert.equal(availableMapIdOf('arx:8', [8, 11]), 'arx:8')
    assert.equal(availableMapIdOf('blank:flat', []), 'blank:flat')
  })

  void it('drops a level the list does not have', () => {
    assert.equal(availableMapIdOf('arx:8', [11]), undefined)
  })

  void it('drops a map that is not a kind of the list', () => {
    assert.equal(availableMapIdOf('nowhere:1', [8]), undefined)
    assert.equal(availableMapIdOf('arx:not-a-number', [8]), undefined)
  })

  void it('gives nothing when the url names no map', () => {
    assert.equal(availableMapIdOf(undefined, [8]), undefined)
  })
})

void describe('mapIdFromUrl', () => {
  void it('reads the map of the url', () => {
    assert.equal(mapIdFromUrl(urlOf('map=arx:8')), 'arx:8')
    assert.equal(mapIdFromUrl(urlOf('position=1,2,3&map=custom:0')), 'custom:0')
  })

  void it('reads the name of the map, and the old value of it', () => {
    assert.equal(mapIdFromUrl(urlOf('map=arx-fatalis-level-8')), 'arx:8')
    assert.equal(mapIdFromUrl(urlOf('map=arx-fatalis-level-1')), 'arx:1')
    assert.equal(mapIdFromUrl(urlOf('map=blank-flat')), 'blank:flat')
    assert.equal(mapIdFromUrl(urlOf('map=arx:8')), 'arx:8')
  })

  void it('reads nothing when the parameter is empty or missing', () => {
    assert.equal(mapIdFromUrl(urlOf('map=')), undefined)
    assert.equal(mapIdFromUrl(urlOf('position=1,2,3')), undefined)
    assert.equal(mapIdFromUrl(undefined), undefined)
  })
})

void describe('the name of a map', () => {
  void it('writes a map with hyphens, so a url does not escape it', () => {
    assert.equal(mapSlugOf('arx:8'), 'arx-fatalis-level-8')
    assert.equal(mapSlugOf('blank:flat'), 'blank-flat')
    assert.equal(mapSlugOf('custom:0'), 'custom-0')
  })

  void it('reads every name back', () => {
    assert.equal(mapIdOfSlug('arx-fatalis-level-8'), 'arx:8')
    assert.equal(mapIdOfSlug('arx-8'), 'arx:8')
    assert.equal(mapIdOfSlug('blank-flat'), 'blank:flat')
    assert.equal(mapIdOfSlug('custom:0'), 'custom:0')
    assert.equal(mapIdOfSlug('something'), undefined)
  })

  void it('remembers the map of the visit in the storage', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string): string | null => {
        return store.get(key) ?? null
      },
      setItem: (key: string, value: string): void => {
        store.set(key, value)
      },
      removeItem: (key: string): void => {
        store.delete(key)
      },
    }

    rememberMapId('arx:8', storage)

    assert.equal(store.get('map'), 'arx-fatalis-level-8')
    assert.equal(storedMapId(storage), 'arx:8')
    assert.equal(storedMapId(undefined), undefined)
  })
})

void describe('editedMapIdsOf', () => {
  void it('marks the maps that have steps on them', () => {
    const saved = new Map([
      ['arx:8', [record()]],
      ['arx:11', []],
    ])

    assert.deepEqual(editedMapIdsOf(saved, 'blank:flat', false), new Set(['arx:8']))
  })

  void it('marks the map on the screen from its live history', () => {
    assert.deepEqual(editedMapIdsOf(new Map(), 'arx:8', true), new Set(['arx:8']))
  })

  void it('clears the map on the screen when every step was taken back', () => {
    const saved = new Map([['arx:8', [record()]]])

    assert.deepEqual(editedMapIdsOf(saved, 'arx:8', false), new Set())
  })
})
