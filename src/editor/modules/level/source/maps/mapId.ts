import { getLocalStorage, type StorageLike } from '../../../persistedRef/storage.ts'
import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../../../persistedRef/url.ts'

/**
 * The name and the value of a map: the two forms the url and the storage carry.
 *
 * @remarks
 * The value of a map is the id of the editor (`arx:8`, `blank:flat`, `custom:0`), and the colon of it is escaped in a
 * url: the name is the same map without the escape (`arx-fatalis-level-8`, `blank-flat`, `custom-0`). This module is the
 * translation between the two, and the storage of the map of the last visit — nothing of the list of the maps is here,
 * that is [`../maps.ts`](../maps.ts).
 */

/**
 * The url parameter that names the map the editor opens.
 */
export const MAP_PARAMETER = 'map'

/**
 * The key the map of the last visit is kept under in the browser.
 */
const MAP_STORAGE_KEY = 'map'

/**
 * The name a map carries in the url, with hyphens instead of the colon of its value.
 *
 * @remarks
 * The value of a map is an id of the editor (`arx:8`, `blank:flat`, `custom:0`), and the colon of it is escaped in a
 * url (`arx%3A8`), which reads badly in a bar a link is copied from. The name is the same map without the escape:
 * `arx-fatalis-level-8`, `blank-flat`, `custom-0`.
 *
 * @param id The value of the map.
 *
 * @returns The name the url and the storage carry.
 */
export function mapSlugOf(id: string): string {
  if (id.startsWith('arx:')) {
    return `arx-fatalis-level-${id.slice(4)}`
  }

  return id.replace(':', '-')
}

/**
 * The value of a map, from the name a url or the storage carries.
 *
 * @remarks
 * The old form of the value (`arx:8`) is read too, so a link of before the names keeps working.
 *
 * @param slug The name the url or the storage carries.
 *
 * @returns The value of the map, or `undefined` when the name is not one.
 */
export function mapIdOfSlug(slug: string): string | undefined {
  const value = slug.trim()

  if (value.startsWith('arx-fatalis-level-')) {
    return `arx:${value.slice('arx-fatalis-level-'.length)}`
  }

  if (value.startsWith('arx-')) {
    return `arx:${value.slice(4)}`
  }

  if (value.includes(':')) {
    return value
  }

  if (value.startsWith('blank-')) {
    return `blank:${value.slice(6)}`
  }

  if (value.startsWith('custom-')) {
    return `custom:${value.slice(7)}`
  }

  return undefined
}

/**
 * The map of the last visit, from the storage of the browser.
 *
 * @param storage The storage to read, the local storage of the page by default.
 *
 * @returns The value of the map, or `undefined` when the browser has none.
 */
export function storedMapId(storage: StorageLike | undefined = getLocalStorage(undefined)): string | undefined {
  if (storage === undefined) {
    return undefined
  }

  try {
    const stored = storage.getItem(MAP_STORAGE_KEY)

    if (stored === null || stored.trim() === '') {
      return undefined
    }

    return mapIdOfSlug(stored)
  } catch {
    return undefined
  }
}

/**
 * Remembers the map of the session for the next visit.
 *
 * @param id The value of the map.
 * @param storage The storage to write, the local storage of the page by default.
 */
export function rememberMapId(id: string, storage: StorageLike | undefined = getLocalStorage(undefined)): void {
  if (storage === undefined) {
    return
  }

  try {
    storage.setItem(MAP_STORAGE_KEY, mapSlugOf(id))
  } catch {
    // a browser that refuses to write keeps the url only: the next visit starts from the default
  }
}

export function mapIdFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, MAP_PARAMETER)

  // an empty parameter (`?map=`) says nothing, the same as no parameter at all
  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  return mapIdOfSlug(raw) ?? raw.trim()
}
