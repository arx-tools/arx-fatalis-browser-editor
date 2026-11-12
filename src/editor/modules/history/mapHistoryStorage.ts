import { getLocalStorage, isQuotaError, type StorageLike } from '../persistedRef/storage.ts'
import { reportProblem } from '../persistedRef/persistenceProblems.ts'
import type { HistoryRecord } from './records.ts'

/**
 * The prefix of the key every map's stored steps live under.
 *
 * @remarks
 * The rest of the key is the value of the map in the list (`arx:8`, `custom:0`), so the key is the map itself and the
 * two can not point at different levels.
 */
const KEY_PREFIX = 'mapHistory:'

/**
 * The key the bookkeeping of the stored maps lives under: which map was written when, so the oldest can be dropped.
 *
 * @remarks
 * The stored form of one map is small (the steps are indices and the polygons they took out, not the level), but the
 * storage is a few megabytes for the whole page: the editor keeps the history of the last maps, and the ones the
 * author does not touch fall out.
 */
const INDEX_KEY = 'mapHistory:index'

/**
 * The version of the stored shape.
 *
 * @remarks
 * A build must not guess at a stored value it does not know: a value of another version is dropped, not read. The
 * number is bumped when the shape changes in a way an older or a newer build would read wrong.
 */
const STORAGE_VERSION = 2

/**
 * The version that stored only the steps on the level, without the ones taken back.
 *
 * @remarks
 * A value of that version is still read: its steps are all on the level, so its position is the end of its list. The
 * redo of an author who had taken a step back before the update is lost with it, which is better than dropping the
 * steps that are on the level.
 */
const LEGACY_STORAGE_VERSION = 1

/**
 * How many maps keep their stored history.
 */
const MAX_MAPS = 8

/**
 * The stored steps of one map.
 */
export interface StoredHistory {
  /**
   * The fingerprint of the level file the steps were made on.
   *
   * @remarks
   * The steps carry polygon indices, so they may only be replayed on the same file: the fingerprint is compared with
   * the one of the loaded level before anything is applied.
   */
  readonly fingerprint: string
  /**
   * The steps, oldest first, the ones taken back included.
   */
  readonly records: readonly HistoryRecord[]
  /**
   * How many of the steps are on the level.
   */
  readonly position: number
}

/**
 * Reads a value, without letting a blocked storage throw.
 *
 * @param storage The storage to read.
 * @param key The key to read.
 *
 * @returns The value, or `undefined` when it is missing or the storage refuses.
 */
function readValue(storage: StorageLike, key: string): string | undefined {
  try {
    return storage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Parses a stored value.
 *
 * @param raw The value the storage held.
 *
 * @returns The parsed value, or `undefined` when it is not JSON.
 */
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

/**
 * Tells whether a parsed value is the stored shape of this build.
 *
 * @param value The parsed value.
 *
 * @returns True for the shape this build reads.
 */
function isStoredHistory(value: unknown): value is {
  version: number
  fingerprint: string
  records: HistoryRecord[]
  position?: number
} {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as { version?: unknown; fingerprint?: unknown; records?: unknown }

  return (
    (entry.version === STORAGE_VERSION || entry.version === LEGACY_STORAGE_VERSION) &&
    typeof entry.fingerprint === 'string' &&
    Array.isArray(entry.records)
  )
}

/**
 * Reads the index of the stored maps.
 *
 * @param storage The storage to read.
 *
 * @returns The time every map was written, by its id.
 */
function readIndex(storage: StorageLike): Record<string, number> {
  const raw = readValue(storage, INDEX_KEY)

  if (raw === undefined) {
    return {}
  }

  const parsed = parseJson(raw)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {}
  }

  const index: Record<string, number> = {}

  for (const [key, time] of Object.entries(parsed)) {
    if (typeof time === 'number') {
      index[key] = time
    }
  }

  return index
}

/**
 * Writes the index of the stored maps.
 *
 * @param storage The storage to write.
 * @param index The time every map was written, by its id.
 */
function writeIndex(storage: StorageLike, index: Readonly<Record<string, number>>): void {
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // the index is bookkeeping: a storage that can not keep it still has the steps, and the next write tries again
  }
}

/**
 * Copies an index without one of its entries.
 *
 * @param index The index to copy.
 * @param id The map to leave out.
 *
 * @returns The index without the map.
 */
function withoutKey(index: Readonly<Record<string, number>>, id: string): Record<string, number> {
  const next: Record<string, number> = {}

  for (const [key, time] of Object.entries(index)) {
    if (key !== id) {
      next[key] = time
    }
  }

  return next
}

/**
 * Marks a map as written now.
 *
 * @param storage The storage to write.
 * @param id The value of the map in the list.
 */
function rememberInIndex(storage: StorageLike, id: string): void {
  const index = readIndex(storage)

  index[id] = Date.now()
  writeIndex(storage, index)
}

/**
 * Takes a map out of the index.
 *
 * @param storage The storage to write.
 * @param id The value of the map in the list.
 */
function forgetInIndex(storage: StorageLike, id: string): void {
  const index = readIndex(storage)

  if (index[id] === undefined) {
    return
  }

  writeIndex(storage, withoutKey(index, id))
}

/**
 * Drops the oldest stored maps above a limit.
 *
 * @param storage The storage to write.
 * @param keep How many maps may stay.
 */
function prune(storage: StorageLike, keep: number): void {
  const index = readIndex(storage)
  const ids = Object.keys(index)

  if (ids.length <= keep) {
    return
  }

  const oldest = ids
    .toSorted((first, second) => {
      return (index[first] ?? 0) - (index[second] ?? 0)
    })
    .slice(0, ids.length - keep)

  let next = index

  for (const id of oldest) {
    try {
      storage.removeItem(KEY_PREFIX + id)
    } catch {
      // the next write tries again
    }

    next = withoutKey(next, id)
  }

  writeIndex(storage, next)
}

/**
 * Forgets the stored steps of a map.
 *
 * @param id The value of the map in the list.
 * @param storage The storage to write, the localStorage of the page by default.
 */
export function dropStoredHistory(id: string, storage?: StorageLike): void {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return
  }

  try {
    target.removeItem(KEY_PREFIX + id)
  } catch {
    // a storage that can not remove a value can not keep one either: there is nothing else to do
  }

  forgetInIndex(target, id)
}

/**
 * The JSON value of the stored steps.
 *
 * @remarks
 * The storage keeps the steps of a map under its own key, and the `history.json` of an archive keeps the steps the level
 * was exported with: both are this one value, so a reader of either reads the same shape, and a build only has one place
 * to bump when the shape changes.
 *
 * @param history The steps of the level and how many of them are on it.
 *
 * @returns The value to write as JSON.
 */
export function storedHistoryJsonOf(history: StoredHistory): {
  readonly version: number
  readonly fingerprint: string
  readonly records: readonly HistoryRecord[]
  readonly position: number
} {
  return {
    version: STORAGE_VERSION,
    fingerprint: history.fingerprint,
    records: [...history.records],
    position: history.position,
  }
}

/**
 * Reads a JSON value of the stored steps.
 *
 * @param value The parsed JSON.
 *
 * @returns The steps, or `undefined` when the value is not one this build reads.
 */
export function storedHistoryOfValue(value: unknown): StoredHistory | undefined {
  if (!isStoredHistory(value)) {
    return undefined
  }

  // a value of the version before the position: every step of it is on the level
  let position = value.position ?? 0

  if (value.version === LEGACY_STORAGE_VERSION) {
    position = value.records.length
  }

  return {
    fingerprint: value.fingerprint,
    records: value.records,
    position: Math.min(Math.max(position, 0), value.records.length),
  }
}

/**
 * Reads the stored steps of a map.
 *
 * @param id The value of the map in the list.
 * @param storage The storage to read, the localStorage of the page by default.
 *
 * @returns The stored steps, or `undefined` when the map has none (or the value is not one this build reads).
 */
export function readStoredHistory(id: string, storage?: StorageLike): StoredHistory | undefined {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return undefined
  }

  const raw = readValue(target, KEY_PREFIX + id)

  if (raw === undefined) {
    return undefined
  }

  const stored = storedHistoryOfValue(parseJson(raw))

  if (stored === undefined) {
    // a value of another build (or a broken one) says nothing about this level: it goes, instead of being guessed at
    dropStoredHistory(id, target)

    return undefined
  }

  return stored
}

/**
 * Writes the steps of a map down, or forgets the map when it has none.
 *
 * @param id The value of the map in the list.
 * @param history The steps of the level and how many of them are on it.
 * @param storage The storage to write, the localStorage of the page by default.
 */
export function writeStoredHistory(id: string, history: StoredHistory, storage?: StorageLike): void {
  const target = storage ?? getLocalStorage(undefined)

  if (target === undefined) {
    return
  }

  if (history.records.length === 0) {
    dropStoredHistory(id, target)

    return
  }

  const value = storedHistoryJsonOf(history)

  try {
    target.setItem(KEY_PREFIX + id, JSON.stringify(value))
  } catch (error) {
    if (isQuotaError(error)) {
      // the storage is full: the oldest maps go, and the write is tried once more (a step of this level is worth more
      // than the steps of a level the author left)
      prune(target, 1)

      try {
        target.setItem(KEY_PREFIX + id, JSON.stringify(value))
      } catch {
        reportProblem('mapHistory', 'localStorage', 'The history could not be saved: the storage is full.')
      }

      rememberInIndex(target, id)

      return
    }

    reportProblem('mapHistory', 'localStorage', 'The history could not be saved: the storage is blocked.')

    return
  }

  rememberInIndex(target, id)
  prune(target, MAX_MAPS)
}
