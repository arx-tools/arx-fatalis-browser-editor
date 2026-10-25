import { isPrimitive, parseJson } from './helpers.ts'

/**
 * Reads and writes the query string of the page.
 */
export type UrlAdapter = {
  /**
   * The current query string without the leading `?`.
   */
  read: () => string
  /**
   * Replaces the query string (without the leading `?`) and keeps the path and the hash.
   *
   * @param search The new query string, an empty string removes every parameter.
   */
  write: (search: string) => void
}

/**
 * The page objects the browser url adapter works with, the browser itself by default.
 */
export type BrowserPage = {
  location?: Pick<Location, 'hash' | 'pathname' | 'search'> | undefined
  history?: Pick<History, 'replaceState'> | undefined
}

/**
 * Builds the url adapter of a page, or undefined when there is no page to work with.
 *
 * @remarks
 * - the adapter writes with `history.replaceState`, never with `pushState`: a persisted value does
 * not add a history entry, so one press on the browser back button still leaves the page (this is
 * the rule of the rest of the editor too)
 * - the path, the hash and the other parameters are kept, only the query string changes
 *
 * @param page The page objects, `globalThis` by default.
 * @returns The adapter, or undefined outside of the browser.
 */
export function createBrowserUrlAdapter(page: BrowserPage = {}): UrlAdapter | undefined {
  const location = page.location ?? (globalThis as { location?: Location }).location
  const history = page.history ?? (globalThis as { history?: History }).history

  if (location === undefined || history === undefined) {
    return undefined
  }

  return {
    read(): string {
      return location.search.replace(/^\?/, '')
    },
    write(search: string): void {
      let query = ''

      if (search !== '') {
        query = `?${search}`
      }

      history.replaceState(null, '', `${location.pathname}${query}${location.hash}`)
    },
  }
}

/**
 * Finds the url adapter of the page, or undefined when it is not available.
 *
 * @param injected The adapter the caller passed in, when it has one.
 * @returns The adapter, or undefined when there is no page to work with.
 */
export function getUrlAdapter(injected: UrlAdapter | undefined): UrlAdapter | undefined {
  if (injected !== undefined) {
    return injected
  }

  return createBrowserUrlAdapter()
}

/**
 * The default url encoding: strings as they are, primitives stringified, a list of primitives joined
 * by commas and everything else as json.
 *
 * @param value The value to encode.
 * @returns The query string value, or undefined when the value is not representable.
 */
export function defaultUrlSerialize(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (
    Array.isArray(value) &&
    value.every((item) => {
      return isPrimitive(item)
    })
  ) {
    return value.join(',')
  }

  return JSON.stringify(value)
}

/**
 * The default url decoding, guided by the type of the default value.
 *
 * @param raw The query string value.
 * @param fallback The default value of the ref, its type guides the parsing.
 * @returns The decoded value, or undefined when the raw text can not be decoded.
 */
export function defaultUrlDeserialize(raw: string, fallback: unknown): unknown {
  if (typeof fallback === 'string') {
    return raw
  }

  if (typeof fallback === 'number') {
    const parsed = Number.parseFloat(raw)

    if (Number.isNaN(parsed)) {
      return undefined
    }

    return parsed
  }

  if (typeof fallback === 'boolean') {
    return raw === 'true' || raw === '1'
  }

  if (Array.isArray(fallback)) {
    const parsed = parseJson(raw)

    if (Array.isArray(parsed)) {
      return parsed
    }

    const parts = raw.split(',')

    if (fallback.length > 0 && typeof fallback[0] === 'number') {
      return parts.map((part) => {
        return Number.parseFloat(part)
      })
    }

    return parts
  }

  return parseJson(raw)
}

/**
 * Reads one parameter out of the query string.
 *
 * @param url The url adapter to read with.
 * @param key The parameter to read.
 * @returns The value, or undefined when the parameter is not there.
 */
export function readUrlValue(url: UrlAdapter, key: string): string | undefined {
  return new URLSearchParams(url.read()).get(key) ?? undefined
}

/**
 * Writes (or removes) one parameter of the query string, keeping the others.
 *
 * @param url The url adapter to write with.
 * @param key The parameter to write.
 * @param value The new value, undefined removes the parameter.
 */
export function writeUrlValue(url: UrlAdapter, key: string, value: string | undefined): void {
  const params = new URLSearchParams(url.read())

  if (value === undefined) {
    params.delete(key)
  } else {
    params.set(key, value)
  }

  url.write(params.toString())
}
