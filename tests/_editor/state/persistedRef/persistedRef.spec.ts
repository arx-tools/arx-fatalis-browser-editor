import assert from 'node:assert/strict'
import { beforeEach, describe, it, type TestContext } from 'node:test'
import { nextTick } from 'vue'
import {
  clearPersistedRefRegistry,
  persistedRef,
  type PersistenceAdapters,
} from '../../../../src/_editor/state/persistedRef/persistedRef.ts'
import { persistenceProblems } from '../../../../src/_editor/state/persistedRef/persistenceProblems.ts'

/**
 * A stand-in for `localStorage`, so the tests run in node where there is no web storage.
 */
type MemoryStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> & {
  data: Map<string, string>
  failing: boolean
}

/**
 * Builds an in-memory storage.
 *
 * @param entries The values to start with.
 * @returns The storage and its backing map.
 */
function createMemoryStorage(entries: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(entries))
  const storage: MemoryStorage = {
    data,
    failing: false,
    getItem(key: string): string | null {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      if (storage.failing) {
        throw new Error('QuotaExceededError')
      }

      data.set(key, value)
    },
    removeItem(key: string): void {
      data.delete(key)
    },
  }

  return storage
}

/**
 * Builds a fake url adapter: the query string lives in a plain string.
 *
 * @param search The query string to start with, for example `camera=1,2,3`.
 * @returns The adapter and a getter for the current query string.
 */
function createFakeUrl(search = ''): {
  adapters: { url: { read: () => string; write: (value: string) => void } }
  current: () => string
} {
  let query = search

  return {
    adapters: {
      url: {
        read(): string {
          return query
        },
        write(value: string): void {
          query = value
        },
      },
    },
    current(): string {
      return query
    },
  }
}

/**
 * Creates the adapters around one memory storage and one fake url.
 *
 * @param options The stored entries and the starting query string.
 * @param options.search The query string to start with.
 * @param options.stored The entries in the storage.
 * @returns The adapters and the accesses to the fakes.
 */
function createAdapters(options: { search?: string; stored?: Record<string, string> } = {}): {
  adapters: PersistenceAdapters
  current: () => string
  storage: MemoryStorage
} {
  const storage = createMemoryStorage(options.stored)
  const url = createFakeUrl(options.search)

  return {
    adapters: { localStorage: storage, url: url.adapters.url },
    current: url.current,
    storage,
  }
}

/**
 * Reads one parameter out of a query string.
 *
 * @param search The query string, for example `a=1&b=2`.
 * @param key The parameter to read.
 * @returns The value, or undefined when the parameter is not there.
 */
function readParam(search: string, key: string): string | undefined {
  return new URLSearchParams(search).get(key) ?? undefined
}

void describe('persistedRef', () => {
  // every test starts from an empty registry, so the same key can be used again
  beforeEach((): void => {
    clearPersistedRefRegistry()
  })

  void it('behaves like a plain ref when nothing is persisted', () => {
    const { adapters, current, storage } = createAdapters()

    const value = persistedRef({ key: 'plain', defaultValue: 11 }, adapters)

    assert.equal(value.value, 11)
    value.value = 12
    assert.equal(value.value, 12)
    assert.equal(storage.data.size, 0)
    assert.equal(current(), '')
  })

  void it('hydrates from the localStorage value', () => {
    const { adapters } = createAdapters({ stored: { camera: '[1,2,3]' } })

    const camera = persistedRef<number[]>({ key: 'camera', persistInLocalStorage: true }, adapters)

    assert.deepEqual(camera.value, [1, 2, 3])
  })

  void it('prefers the url value over the stored one', () => {
    const { adapters } = createAdapters({ search: 'camera=7,8,9', stored: { camera: '[1,2,3]' } })

    const camera = persistedRef<number[]>(
      { key: 'camera', defaultValue: [0, 0, 0], persistInLocalStorage: true, persistInUrl: true },
      adapters,
    )

    assert.deepEqual(camera.value, [7, 8, 9])
  })

  void it('falls back to the default value when there is nothing stored', () => {
    const { adapters } = createAdapters()

    const camera = persistedRef<number[]>(
      { key: 'camera', defaultValue: [0, 0, 0], persistInLocalStorage: true, persistInUrl: true },
      adapters,
    )

    assert.deepEqual(camera.value, [0, 0, 0])
  })

  void it('writes the json value into the localStorage', async () => {
    const { adapters, storage } = createAdapters()

    const camera = persistedRef<number[]>(
      { key: 'camera', defaultValue: [0, 0, 0], persistInLocalStorage: true },
      adapters,
    )
    camera.value = [4, 5, 6]
    await nextTick()

    assert.equal(storage.data.get('camera'), '[4,5,6]')
  })

  void it('writes the value into the url and drops it at the default', async () => {
    const { adapters, current } = createAdapters({ search: 'keep=1' })

    const camera = persistedRef<string>({ key: 'camera', defaultValue: '0,0,0', persistInUrl: true }, adapters)

    camera.value = '1,2,3'
    await nextTick()
    assert.equal(readParam(current(), 'camera'), '1,2,3')
    // the other parameters are kept
    assert.equal(readParam(current(), 'keep'), '1')

    camera.value = '0,0,0'
    await nextTick()
    assert.equal(readParam(current(), 'camera'), undefined)
  })

  void it('does not write into a target which is not enabled', async () => {
    const { adapters, current, storage } = createAdapters()

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a' }, adapters)
    camera.value = 'b'
    await nextTick()

    assert.equal(storage.data.size, 0)
    assert.equal(current(), '')
  })

  void it('returns the same ref for the same key', () => {
    const { adapters } = createAdapters()

    const first = persistedRef<string>({ key: 'shared', defaultValue: 'a' }, adapters)
    const second = persistedRef<string>({ key: 'shared', defaultValue: 'a' }, adapters)

    assert.equal(first, second)
    first.value = 'b'
    assert.equal(second.value, 'b')
  })

  void it('falls back to the default value when the stored one is not json', () => {
    const { adapters } = createAdapters({ stored: { camera: 'not json' } })

    const camera = persistedRef<number[]>(
      { key: 'camera', defaultValue: [1, 2, 3], persistInLocalStorage: true },
      adapters,
    )

    assert.deepEqual(camera.value, [1, 2, 3])
  })

  void it('keeps working when the storage throws and reports the problem', async (t: TestContext) => {
    const { adapters, storage } = createAdapters()
    storage.failing = true
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a', persistInLocalStorage: true }, adapters)
    camera.value = 'b'
    await nextTick()

    t.assert.strictEqual(camera.value, 'b')
    t.assert.ok(warnings.length > 0)
    t.assert.ok(
      persistenceProblems.value.some((problem) => {
        return problem.key === 'camera'
      }),
    )
  })

  void it('reports a full storage and stays in memory', (t: TestContext) => {
    const { adapters, storage } = createAdapters()
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })
    // a full storage throws the quota error, the same way the browser does
    storage.setItem = (): void => {
      throw new DOMException('the quota is reached', 'QuotaExceededError')
    }

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a', persistInLocalStorage: true }, adapters)
    camera.value = 'b'

    t.assert.strictEqual(camera.value, 'b')
    t.assert.strictEqual(warnings.length, 1)
    t.assert.match(warnings[0] ?? '', /full/u)
  })

  void it('probes a storage only once', (t: TestContext) => {
    const { adapters, storage } = createAdapters()
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })
    storage.failing = true

    persistedRef<string>({ key: 'first', defaultValue: 'a', persistInLocalStorage: true }, adapters)
    persistedRef<string>({ key: 'second', defaultValue: 'b', persistInLocalStorage: true }, adapters)

    t.assert.strictEqual(warnings.length, 1)
  })

  void it('reports a missing page url', (t: TestContext) => {
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })

    // the tests run in node, there is no location to persist into
    const camera = persistedRef<string>({ key: 'no-url', defaultValue: 'a', persistInUrl: true })

    t.assert.strictEqual(camera.value, 'a')
    t.assert.ok(warnings.length > 0)
  })

  void it('reports that the debounce wins over the throttle', (t: TestContext) => {
    const { adapters, current } = createAdapters()
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const camera = persistedRef<string>(
      { key: 'camera', defaultValue: 'a', persistInUrl: true, throttle: 250, debounce: 100 },
      adapters,
    )
    camera.value = 'b'
    t.mock.timers.tick(100)

    t.assert.ok(
      warnings.some((warning) => {
        return warning.includes('debounce')
      }),
    )
    t.assert.strictEqual(readParam(current(), 'camera'), 'b')
  })

  void it('uses the custom storage serializers', async () => {
    const { adapters, storage } = createAdapters({ stored: { camera: '1|2|3' } })

    const camera = persistedRef<number[]>(
      {
        key: 'camera',
        defaultValue: [0, 0, 0],
        persistInLocalStorage: true,
        serialize: (value) => {
          return value.join('|')
        },
        deserialize: (raw) => {
          return raw.split('|').map((part) => {
            return Number.parseFloat(part)
          })
        },
      },
      adapters,
    )

    // the stored value goes through the custom deserializer
    assert.deepEqual(camera.value, [1, 2, 3])

    camera.value = [4, 5, 6]
    await nextTick()
    assert.equal(storage.data.get('camera'), '4|5|6')
  })

  void it('hydrates the url value with the custom deserializer', () => {
    const { adapters } = createAdapters({ search: 'camera=1|2|3' })

    const camera = persistedRef<number[]>(
      {
        key: 'camera',
        defaultValue: [0, 0, 0],
        persistInUrl: true,
        urlDeserialize: (raw) => {
          return raw.split('|').map((part) => {
            return Number.parseFloat(part)
          })
        },
      },
      adapters,
    )

    assert.deepEqual(camera.value, [1, 2, 3])
  })

  void it('does nothing when flush has no pending value', () => {
    const { adapters, current } = createAdapters()

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a', persistInUrl: true }, adapters)
    camera.flush()

    assert.equal(current(), '')
  })

  void it('reports a missing localStorage', (t: TestContext) => {
    const { adapters } = createAdapters()
    const warnings: string[] = []
    t.mock.method(console, 'warn', (message: string) => {
      warnings.push(message)
    })

    const camera = persistedRef<string>(
      { key: 'no-storage', defaultValue: 'a', persistInLocalStorage: true },
      { url: adapters.url },
    )

    t.assert.strictEqual(camera.value, 'a')
    t.assert.ok(warnings.length > 0)
  })

  void it('uses the custom serializers for the url', async () => {
    const { adapters, current } = createAdapters()

    const camera = persistedRef<number[]>(
      {
        key: 'camera',
        defaultValue: [0, 0, 0],
        persistInUrl: true,
        urlSerialize: (value) => {
          return value.join('|')
        },
        urlDeserialize: (raw) => {
          return raw.split('|').map((part) => {
            return Number.parseFloat(part)
          })
        },
      },
      adapters,
    )

    camera.value = [1, 2, 3]
    await nextTick()

    assert.equal(readParam(current(), 'camera'), '1|2|3')
  })

  void it('coalesces the writes with throttle', (t: TestContext) => {
    const { adapters, current } = createAdapters()
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const camera = persistedRef<string>(
      { key: 'camera', defaultValue: 'a', persistInUrl: true, throttle: 250 },
      adapters,
    )

    camera.value = 'b'
    camera.value = 'c'
    camera.value = 'd'

    // nothing is written yet: the throttle window is still open
    t.assert.strictEqual(readParam(current(), 'camera'), undefined)

    t.mock.timers.tick(250)
    t.assert.strictEqual(readParam(current(), 'camera'), 'd')
  })

  void it('writes after the quiet time with debounce', (t: TestContext) => {
    const { adapters, current } = createAdapters()
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const camera = persistedRef<string>(
      { key: 'camera', defaultValue: 'a', persistInUrl: true, debounce: 100 },
      adapters,
    )

    camera.value = 'b'
    t.mock.timers.tick(50)
    camera.value = 'c'
    t.mock.timers.tick(99)
    t.assert.strictEqual(readParam(current(), 'camera'), undefined)

    t.mock.timers.tick(1)
    t.assert.strictEqual(readParam(current(), 'camera'), 'c')
  })

  void it('writes the pending value on flush', (t: TestContext) => {
    const { adapters, current } = createAdapters()
    t.mock.timers.enable({ apis: ['setTimeout'] })

    const camera = persistedRef<string>(
      { key: 'camera', defaultValue: 'a', persistInUrl: true, throttle: 250 },
      adapters,
    )
    camera.value = 'b'
    camera.flush()

    t.assert.strictEqual(readParam(current(), 'camera'), 'b')

    // the timer scheduled before the flush must not write anything anymore
    t.mock.timers.runAll()
    t.assert.strictEqual(readParam(current(), 'camera'), 'b')
  })

  void it('clears the stored, the url and the in memory value on reset', async () => {
    const { adapters, current, storage } = createAdapters()

    const camera = persistedRef<string>(
      { key: 'camera', defaultValue: 'a', persistInLocalStorage: true, persistInUrl: true },
      adapters,
    )
    camera.value = 'b'
    await nextTick()
    assert.equal(storage.data.get('camera'), '"b"')

    camera.reset()

    assert.equal(camera.value, 'a')
    assert.equal(storage.data.get('camera'), undefined)
    assert.equal(readParam(current(), 'camera'), undefined)
  })

  void it('exposes the key of the ref', () => {
    const { adapters } = createAdapters()

    const camera = persistedRef<string>({ key: 'camera', defaultValue: 'a' }, adapters)

    assert.equal(camera.key, 'camera')
  })
})
