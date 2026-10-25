import { ref, watch, type Ref } from 'vue'
import { deepEquals, parseJson } from './helpers.ts'
import { clearPersistenceProblems, reportProblem } from './persistenceProblems.ts'
import { checkStorage, clearStorageProbes, getLocalStorage, type StorageLike } from './storage.ts'
import {
  defaultUrlDeserialize,
  defaultUrlSerialize,
  getUrlAdapter,
  readUrlValue,
  writeUrlValue,
  type UrlAdapter,
} from './url.ts'

/**
 * A value which survives a JSON round trip: the only shapes the module stores.
 */
export type PersistedValue = boolean | null | number | string | PersistedValue[] | { [key: string]: PersistedValue }

/**
 * The outside world of the module: the storages and the url.
 *
 * @remarks
 * - the production code passes nothing, the module finds `localStorage` and `location` itself
 * - the tests pass in memory fakes, because they run in node where there is no web storage
 */
export type PersistenceAdapters = {
  localStorage?: StorageLike | undefined
  url?: UrlAdapter | undefined
}

/**
 * The configuration of {@link persistedRef}.
 */
export type PersistedRefOptions<T> = {
  /**
   * The key of the value: the `localStorage` key and the url parameter name.
   */
  key: string
  /**
   * The value used when neither the url nor the storage has one. Defaults to `undefined`.
   */
  defaultValue?: T
  /**
   * Persist the value in `localStorage`, `false` by default.
   */
  persistInLocalStorage?: boolean
  /**
   * Persist the value in the url as a parameter, `false` by default.
   */
  persistInUrl?: boolean
  /**
   * Delays the writes so that at most one happens in this many milliseconds, `0` (off) by default.
   */
  throttle?: number
  /**
   * Delays the writes until this many milliseconds passed without a change, `0` (off) by default.
   */
  debounce?: number
  /**
   * Removes the url parameter when the value is the default one, `true` by default.
   */
  dropUrlValueAtDefault?: boolean
  /**
   * The storage serialization, JSON by default.
   */
  serialize?: (value: T) => string
  /**
   * The storage deserialization, JSON by default.
   */
  deserialize?: (raw: string) => T
  /**
   * The url serialization, `undefined` removes the parameter.
   */
  urlSerialize?: (value: T) => string | undefined
  /**
   * The url deserialization.
   */
  urlDeserialize?: (raw: string) => T
}

/**
 * A `ref` which also knows where it came from and where it writes itself.
 */
export type PersistedRef<T> = Ref<T> & {
  /**
   * The key of the value: the `localStorage` key and the url parameter name.
   */
  readonly key: string
  /**
   * Sets the value back to the default one and removes it from the enabled targets.
   */
  reset: () => void
  /**
   * Writes a pending (throttled or debounced) value right away.
   */
  flush: () => void
}

/**
 * The refs which are alive, keyed by their `key`: the same key gives back the same ref.
 */
const registry = new Map<string, PersistedRef<unknown>>()

/**
 * The runtime of one persisted ref: the targets, the codecs and the pending write.
 */
type PersistedRefRuntime<T> = {
  targetStorage?: StorageLike | undefined
  targetUrl?: UrlAdapter | undefined
  encodeUrl: (value: T) => string | undefined
  decodeUrl: (raw: string) => T
  encodeStorage: (value: T) => string
  decodeStorage: (raw: string) => T
  dropUrlValueAtDefault: boolean
  delay: number
  isDebounced: boolean
}

/**
 * Builds the codecs and the targets of a persisted ref from its options and the adapters.
 *
 * @param options The configuration of the ref.
 * @param adapters The injected adapters, when the caller has some.
 * @returns The runtime of the ref.
 */
function createRuntime<T>(
  options: PersistedRefOptions<T>,
  adapters: PersistenceAdapters | undefined,
): PersistedRefRuntime<T> {
  const wantsStorage = options.persistInLocalStorage === true
  const wantsUrl = options.persistInUrl === true
  let targetStorage: StorageLike | undefined
  let targetUrl: UrlAdapter | undefined

  if (wantsStorage) {
    targetStorage = getLocalStorage(adapters?.localStorage)
  }

  if (wantsUrl) {
    targetUrl = getUrlAdapter(adapters?.url)
  }

  const debounce = options.debounce ?? 0
  const throttle = options.throttle ?? 0

  if (wantsStorage && targetStorage === undefined) {
    reportProblem(options.key, 'localStorage', 'the web storage is not available, the value stays in memory')
  }

  if (targetStorage !== undefined) {
    checkStorage(options.key, targetStorage)
  }

  if (wantsUrl && targetUrl === undefined) {
    reportProblem(options.key, 'url', 'the page url is not available, the value stays in memory')
  }

  if (debounce > 0 && throttle > 0) {
    reportProblem(options.key, 'url', 'throttle and debounce are both set, the debounce is used')
  }

  let delay = throttle

  if (debounce > 0) {
    delay = debounce
  }

  return {
    targetStorage,
    targetUrl,
    encodeUrl(value: T): string | undefined {
      if (options.urlSerialize !== undefined) {
        return options.urlSerialize(value)
      }

      return defaultUrlSerialize(value)
    },
    decodeUrl(raw: string): T {
      if (options.urlDeserialize !== undefined) {
        return options.urlDeserialize(raw)
      }

      return defaultUrlDeserialize(raw, options.defaultValue) as T
    },
    encodeStorage(value: T): string {
      if (options.serialize !== undefined) {
        return options.serialize(value)
      }

      return JSON.stringify(value)
    },
    decodeStorage(raw: string): T {
      if (options.deserialize !== undefined) {
        return options.deserialize(raw)
      }

      return parseJson(raw) as T
    },
    dropUrlValueAtDefault: options.dropUrlValueAtDefault !== false,
    delay,
    isDebounced: debounce > 0,
  }
}

/**
 * Reads the initial value: the url first, then the storage, then the default one.
 *
 * @param options The configuration of the ref.
 * @param runtime The runtime of the ref.
 * @returns The value to start with.
 */
function hydrate<T>(options: PersistedRefOptions<T>, runtime: PersistedRefRuntime<T>): T | undefined {
  if (runtime.targetUrl !== undefined) {
    const raw = readUrlValue(runtime.targetUrl, options.key)

    if (raw !== undefined) {
      const decoded = runtime.decodeUrl(raw)

      if (decoded !== undefined) {
        return decoded
      }
    }
  }

  if (runtime.targetStorage !== undefined) {
    let raw: string | null = null

    try {
      raw = runtime.targetStorage.getItem(options.key)
    } catch {
      reportProblem(options.key, 'localStorage', 'the web storage can not be read, the value stays in memory')
    }

    if (raw !== null) {
      const decoded = runtime.decodeStorage(raw)

      if (decoded !== undefined) {
        return decoded
      }
    }
  }

  return options.defaultValue
}

/**
 * Writes one value into the enabled targets, removing it when it is the default one.
 *
 * @param options The configuration of the ref.
 * @param runtime The runtime of the ref.
 * @param value The value to write.
 */
function writeValue<T>(options: PersistedRefOptions<T>, runtime: PersistedRefRuntime<T>, value: T | undefined): void {
  // a ref without a defaultValue can hold undefined, which means "nothing to remember"
  const isDefault = deepEquals(value, options.defaultValue)

  if (runtime.targetStorage !== undefined) {
    try {
      if (value === undefined || isDefault) {
        runtime.targetStorage.removeItem(options.key)
      } else {
        runtime.targetStorage.setItem(options.key, runtime.encodeStorage(value))
      }
    } catch {
      reportProblem(options.key, 'localStorage', 'the web storage can not be written, the value stays in memory')
    }
  }

  if (runtime.targetUrl !== undefined) {
    if ((value === undefined || isDefault) && runtime.dropUrlValueAtDefault) {
      writeUrlValue(runtime.targetUrl, options.key, undefined)

      return
    }

    if (value !== undefined) {
      writeUrlValue(runtime.targetUrl, options.key, runtime.encodeUrl(value))
    }
  }
}

/**
 * Starts a timer only when there is none yet, so the repeated writes coalesce into one.
 *
 * @param timer The timer which may already be running.
 * @param delay The delay in milliseconds.
 * @param callback The function to run when the timer fires.
 * @returns The running timer, the existing one or the new one.
 */
function scheduleOnce(
  timer: ReturnType<typeof setTimeout> | undefined,
  delay: number,
  callback: () => void,
): ReturnType<typeof setTimeout> {
  if (timer !== undefined) {
    return timer
  }

  return setTimeout(callback, delay)
}

/**
 * Clears the registry of the shared refs. Only the tests need it, the application keeps the refs alive.
 */
export function clearPersistedRefRegistry(): void {
  registry.clear()
  clearPersistenceProblems()
  clearStorageProbes()
}

/**
 * Creates (or returns) a ref which persists itself into the url and/or the localStorage.
 *
 * @remarks
 * - the same `key` always gives back the same ref, the first call defines the persistence
 * - the initial value comes from the url, then the storage, then the default one
 * - a write goes into every enabled target, removing the value when it is the default one
 * - `throttle` and `debounce` delay the writes, the storage and the url are written together
 * - a missing or blocked storage does not break the ref, it stays in memory and reports a warning
 *
 * @example
 * ```ts
 * const cameraPosition = persistedRef({
 *   key: 'positionAt',
 *   defaultValue: [0, 0, 0],
 *   persistInUrl: true,
 *   throttle: 250,
 * })
 * ```
 *
 * @param options The configuration of the ref, see {@link PersistedRefOptions}.
 * @param adapters The injected storages and url, the tests pass fakes.
 * @returns The ref, with the `key`, `reset()` and `flush()` helpers.
 */
export function persistedRef<T>(
  options: PersistedRefOptions<T> & { defaultValue: T },
  adapters?: PersistenceAdapters,
): PersistedRef<T>
export function persistedRef<T>(
  options: PersistedRefOptions<T>,
  adapters?: PersistenceAdapters,
): PersistedRef<T | undefined>
export function persistedRef<T>(
  options: PersistedRefOptions<T>,
  adapters?: PersistenceAdapters,
): PersistedRef<T | undefined> {
  const existing = registry.get(options.key)

  if (existing !== undefined) {
    return existing as PersistedRef<T | undefined>
  }

  const runtime = createRuntime(options, adapters)
  // the internals work with `T`: the overloads decide whether the caller sees `T` or `T | undefined`
  const state = ref(hydrate(options, runtime)) as unknown as PersistedRef<T>
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let hasPendingWrite = false

  /**
   * Writes the pending value (if any) right away, the throttled and debounced writes call it too.
   */
  function flush(): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer)
      pendingTimer = undefined
    }

    if (!hasPendingWrite) {
      return
    }

    hasPendingWrite = false
    writeValue(options, runtime, state.value)
  }

  /**
   * Marks the value as pending and schedules the write according to the throttle and the debounce.
   */
  function scheduleWrite(): void {
    hasPendingWrite = true

    if (runtime.delay === 0) {
      flush()

      return
    }

    if (runtime.isDebounced) {
      if (pendingTimer !== undefined) {
        clearTimeout(pendingTimer)
        pendingTimer = undefined
      }

      pendingTimer = setTimeout(flush, runtime.delay)

      return
    }

    pendingTimer = scheduleOnce(pendingTimer, runtime.delay, flush)
  }

  Object.assign(state, {
    key: options.key,
    reset: (): void => {
      state.value = options.defaultValue as T
      hasPendingWrite = true
      flush()
    },
    flush: (): void => {
      flush()
    },
  })

  watch(state, scheduleWrite, { deep: true, flush: 'sync' })
  registry.set(options.key, state)

  return state
}
