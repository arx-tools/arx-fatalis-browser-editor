import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  getLocalStorage,
  isQuotaError,
  probeStorage,
  type StorageLike,
} from '../../../../src/_editor/state/persistedRef/storage.ts'

/**
 * Builds a storage which fails on every write and remove the way a real one would.
 *
 * @param error What the storage throws, `undefined` for a working storage. It is typed as `unknown`
 * on purpose: the browser throws a `DOMException`, which does not extend the built-in exception
 * class.
 * @returns The fake, either working or failing on every call.
 */
function createStorage(error?: unknown): StorageLike {
  const data = new Map<string, string>()

  return {
    getItem(key: string): string | null {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      if (error !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a storage throws whatever the browser throws
        throw error
      }

      data.set(key, value)
    },
    removeItem(key: string): void {
      if (error !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- a storage throws whatever the browser throws
        throw error
      }

      data.delete(key)
    },
  }
}

void describe('isQuotaError', () => {
  void it('accepts the chrome and the firefox name of the quota error', () => {
    assert.equal(isQuotaError(new DOMException('full', 'QuotaExceededError')), true)
    assert.equal(isQuotaError(new DOMException('full', 'NS_ERROR_DOM_QUOTA_REACHED')), true)
  })

  void it('rejects every other error', () => {
    assert.equal(isQuotaError(new DOMException('blocked', 'SecurityError')), false)
    assert.equal(isQuotaError(new Error('QuotaExceededError')), false)
    assert.equal(isQuotaError('QuotaExceededError'), false)
    assert.equal(isQuotaError(undefined), false)
  })
})

void describe('probeStorage', () => {
  void it('reports an available storage and leaves nothing behind', () => {
    const storage = createStorage()

    assert.equal(probeStorage(storage), 'available')
    assert.equal(storage.getItem('__arx_storage_probe__'), null)
  })

  void it('reports a storage which throws the quota error as full', () => {
    const error = new DOMException('full', 'QuotaExceededError')
    const storage = createStorage(error)

    assert.equal(probeStorage(storage), 'full')
  })

  void it('reports a storage which throws anything else as blocked', () => {
    const securityError = new DOMException('blocked', 'SecurityError')
    const blocked = createStorage(securityError)
    const failing = createStorage(new Error('nope'))

    assert.equal(probeStorage(blocked), 'blocked')
    assert.equal(probeStorage(failing), 'blocked')
  })
})

void describe('getLocalStorage', () => {
  void it('hands back the injected storage', () => {
    const injected = createStorage()

    assert.equal(getLocalStorage(injected), injected)
  })

  void it('has no storage in node', () => {
    // node has no `localStorage` without the experimental flag, so the lookup falls back to undefined
    assert.equal(getLocalStorage(undefined), undefined)
  })
})
