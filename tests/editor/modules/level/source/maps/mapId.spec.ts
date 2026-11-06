import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  mapIdFromUrl,
  mapIdOfSlug,
  mapSlugOf,
  rememberMapId,
  storedMapId,
} from '../../../../../../src/editor/modules/level/source/maps/mapId.ts'
import type { UrlAdapter } from '../../../../../../src/editor/modules/persistedRef/url.ts'

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
