import { reportProblem } from './persistenceProblems.ts'

/**
 * The part of the web storage api the module uses.
 */
export type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

/**
 * The key of the availability probe: it is written and removed right away, nothing is left behind.
 */
const STORAGE_PROBE_KEY = '__arx_storage_probe__'

/**
 * The storages which were probed already, so the check runs once per page and not once per value.
 */
let probedStorages = new WeakSet<StorageLike>()

/**
 * Tells whether an error the storage threw means that the quota is reached.
 *
 * @remarks
 * - the `code` field is deprecated, the name is the stable part of the error; firefox still reports
 * the quota error as `NS_ERROR_DOM_QUOTA_REACHED`
 *
 * @param error The error the storage threw.
 * @returns True for the quota errors.
 */
export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

/**
 * Probes a storage by writing and removing a test value, the way the MDN availability check does.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API#testing_for_availability
 *
 * @remarks
 * - the probe writes, so a blocked storage and a full storage can be told apart before the first
 * value would fail to persist
 * - the probe does not drop the storage: reading an already stored value still works, only the
 * writing is in trouble
 *
 * @param storage The storage to probe.
 * @returns `available`, `blocked` or `full`.
 */
export function probeStorage(storage: StorageLike): 'available' | 'blocked' | 'full' {
  try {
    storage.setItem(STORAGE_PROBE_KEY, STORAGE_PROBE_KEY)
    storage.removeItem(STORAGE_PROBE_KEY)

    return 'available'
  } catch (error) {
    if (isQuotaError(error)) {
      return 'full'
    }

    return 'blocked'
  }
}

/**
 * Finds the web storage of the page, or undefined when it is not available.
 *
 * @param injected The storage the caller passed in, when it has one.
 * @returns The storage, or undefined when it is blocked or missing.
 */
export function getLocalStorage(injected: StorageLike | undefined): StorageLike | undefined {
  if (injected !== undefined) {
    return injected
  }

  try {
    return localStorage
  } catch {
    return undefined
  }
}

/**
 * Probes a storage once and reports what the ui has to know about it.
 *
 * @param key The key of the persisted ref which found the storage.
 * @param storage The storage to probe.
 */
export function checkStorage(key: string, storage: StorageLike): void {
  if (probedStorages.has(storage)) {
    return
  }

  probedStorages.add(storage)
  const state = probeStorage(storage)

  if (state === 'blocked') {
    reportProblem(key, 'localStorage', 'the web storage is blocked, the values stay in memory')
  } else if (state === 'full') {
    reportProblem(key, 'localStorage', 'the web storage is full, the new values are not persisted')
  }
}

/**
 * Forgets which storages were probed, so a test can start from a clean state.
 */
export function clearStorageProbes(): void {
  probedStorages = new WeakSet<StorageLike>()
}
