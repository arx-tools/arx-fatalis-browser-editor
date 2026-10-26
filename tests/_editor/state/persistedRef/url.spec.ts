import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextTick } from 'vue'
import { persistedRef } from '../../../../src/_editor/state/persistedRef/persistedRef.ts'
import {
  createBrowserUrlAdapter,
  defaultUrlDeserialize,
  defaultUrlSerialize,
  getUrlAdapter,
  readUrlValue,
  writeUrlValue,
  type BrowserPage,
  type UrlAdapter,
} from '../../../../src/_editor/state/persistedRef/url.ts'

/**
 * The location the fake page starts with.
 */
type MockLocation = NonNullable<BrowserPage['location']>

/**
 * The fake history: the adapter only asks for `replaceState`, but the fake also has a `pushState`
 * which records the calls, so a test can prove that a persisted value never adds a history entry.
 */
type MockHistory = NonNullable<BrowserPage['history']> & {
  pushState: History['pushState']
}

/**
 * A fake page for {@link createBrowserUrlAdapter}: the location and the history it reads and writes,
 * plus the urls which were pushed and replaced.
 */
type MockBrowserPage = {
  history: MockHistory
  location: MockLocation
  pushed: string[]
  replaced: string[]
}

/**
 * Builds a fake page: a location and a history which records what happened to the url.
 *
 * @param search The query string to start with.
 * @returns The page, and the urls which were pushed and replaced.
 */
function createFakePage(search = ''): MockBrowserPage {
  const pushed: string[] = []
  const replaced: string[] = []
  const location: MockLocation = { hash: '#frag', pathname: '/editor/', search }
  const history: MockHistory = {
    pushState(_data: unknown, _title: string, url: string): void {
      pushed.push(url)
    },
    replaceState(_data: unknown, _title: string, url: string): void {
      replaced.push(url)
      location.search = new URL(url, 'http://localhost').search
    },
  }

  return { history, location, pushed, replaced }
}

void describe('defaultUrlSerialize', () => {
  void it('keeps a string as it is', () => {
    assert.equal(defaultUrlSerialize('Arx'), 'Arx')
  })

  void it('stringifies a number and a boolean', () => {
    assert.equal(defaultUrlSerialize(11), '11')
    assert.equal(defaultUrlSerialize(false), 'false')
  })

  void it('joins a list of primitives with a comma', () => {
    assert.equal(defaultUrlSerialize([1, 2, 3]), '1,2,3')
    assert.equal(defaultUrlSerialize(['a', 'b']), 'a,b')
  })

  void it('falls back to json for a list of objects', () => {
    assert.equal(defaultUrlSerialize([{ x: 1 }]), '[{"x":1}]')
  })

  void it('falls back to json for an object', () => {
    assert.equal(defaultUrlSerialize({ a: 1, b: 'c' }), '{"a":1,"b":"c"}')
  })

  void it('drops null and undefined', () => {
    assert.equal(defaultUrlSerialize(null), undefined)
    assert.equal(defaultUrlSerialize(undefined), undefined)
  })
})

void describe('defaultUrlDeserialize', () => {
  void it('reads a string as it is', () => {
    assert.equal(defaultUrlDeserialize('Arx', 'fallback'), 'Arx')
  })

  void it('parses a number and drops the garbage', () => {
    assert.equal(defaultUrlDeserialize('11', 0), 11)
    assert.equal(defaultUrlDeserialize('nope', 0), undefined)
  })

  void it('reads a boolean the two ways the browser spells it', () => {
    assert.equal(defaultUrlDeserialize('true', false), true)
    assert.equal(defaultUrlDeserialize('1', false), true)
    assert.equal(defaultUrlDeserialize('false', true), false)
  })

  void it('splits a comma list of numbers', () => {
    assert.deepEqual(defaultUrlDeserialize('1,2,3', [0, 0, 0]), [1, 2, 3])
  })

  void it('splits a comma list of strings', () => {
    assert.deepEqual(defaultUrlDeserialize('a,b', ['']), ['a', 'b'])
  })

  void it('reads a json list of objects', () => {
    assert.deepEqual(defaultUrlDeserialize('[{"x":1}]', []), [{ x: 1 }])
  })

  void it('parses a json object and without a type hint it falls back to json', () => {
    assert.deepEqual(defaultUrlDeserialize('{"a":1}', {}), { a: 1 })
    assert.deepEqual(defaultUrlDeserialize('[1,2]', undefined), [1, 2])
  })
})

void describe('createBrowserUrlAdapter', () => {
  void it('replaces the url instead of adding a history entry', async () => {
    const page = createFakePage('?keep=1')
    const adapter = createBrowserUrlAdapter(page)

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a', persistInUrl: true }, { url: adapter })

    camera.value = 'b'
    await nextTick()

    // a persisted value must never add a history entry: one back press leaves the page
    assert.equal(page.pushed.length, 0)
    assert.equal(page.replaced.length, 1)
    // the path, the other parameters and the hash are kept
    assert.equal(page.replaced[0], '/editor/?keep=1&camera=b#frag')
  })
})

void describe('readUrlValue', () => {
  void it('reads a parameter and skips the missing one', () => {
    const page = createFakePage('?camera=1,2,3&keep=1')
    const adapter = createBrowserUrlAdapter(page)

    if (adapter === undefined) {
      throw new Error('the fake page must give an adapter')
    }

    assert.equal(readUrlValue(adapter, 'camera'), '1,2,3')
    assert.equal(readUrlValue(adapter, 'missing'), undefined)
  })
})

void describe('writeUrlValue', () => {
  void it('sets a parameter and keeps the others', () => {
    const page = createFakePage('?keep=1')
    const adapter = createBrowserUrlAdapter(page)

    if (adapter === undefined) {
      throw new Error('the fake page must give an adapter')
    }

    writeUrlValue(adapter, 'camera', '1,2,3')

    // the commas stay readable, they are legal in a query string
    assert.equal(page.replaced[0], '/editor/?keep=1&camera=1,2,3#frag')
  })

  void it('removes a parameter and keeps the others', () => {
    const page = createFakePage('?keep=1&camera=1,2,3')
    const adapter = createBrowserUrlAdapter(page)

    if (adapter === undefined) {
      throw new Error('the fake page must give an adapter')
    }

    writeUrlValue(adapter, 'camera', undefined)

    assert.equal(page.replaced[0], '/editor/?keep=1#frag')
  })
})

void describe('getUrlAdapter', () => {
  void it('hands back the injected adapter', () => {
    const injected: UrlAdapter = {
      read(): string {
        return ''
      },
      write(): void {
        // the lookup hands the adapter back, nothing is written here
      },
    }

    assert.equal(getUrlAdapter(injected), injected)
  })

  void it('has no adapter without a page', () => {
    // the tests run in node, there is no location to build the browser adapter from
    assert.equal(getUrlAdapter(undefined), undefined)
  })
})
