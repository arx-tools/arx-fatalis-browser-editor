import { parseJson } from '../persistedRef/functions.ts'
import { getLocalStorage, type StorageLike } from '../persistedRef/storage.ts'

/**
 * The key of the `localStorage` entry the names of the rooms live under.
 */
const ROOM_NAMES_KEY = 'roomNames'

/**
 * The version of the stored shape.
 *
 * @remarks
 * A value of another version is dropped instead of guessed at; the names are metadata, so a lost value costs the author
 * the names of a level, not the level.
 */
const STORAGE_VERSION = 1

/**
 * The names of the rooms of one level, by the id of the room as a text.
 */
export type StoredRoomNames = Readonly<Record<string, string>>

/**
 * The names of the rooms of every level, by the value of the map.
 */
export type StoredRoomNamesByMap = Readonly<Record<string, StoredRoomNames>>

/**
 * Tells whether a value is a plain object.
 *
 * @param value The value to read.
 *
 * @returns True for a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads the names of one level, skipping the entries this build does not know.
 *
 * @param value The value the storage held.
 *
 * @returns The names, or `undefined` when the value is not a name map.
 */
export function roomNamesOfValue(value: unknown): StoredRoomNames | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const names: Record<string, string> = {}

  for (const [room, name] of Object.entries(value)) {
    const id = Number.parseInt(room, 10)

    if (typeof name !== 'string' || !Number.isSafeInteger(id) || id < 0) {
      continue
    }

    const trimmed = name.trim()

    if (trimmed !== '') {
      names[room] = trimmed
    }
  }

  return names
}

/**
 * Reads the names of the rooms of every level from the browser.
 *
 * @param storage The storage to read, the `localStorage` of the page by default.
 *
 * @returns The names by the value of the map; an empty object when the storage has none.
 */
export function readStoredRoomNames(
  storage: StorageLike | undefined = getLocalStorage(undefined),
): StoredRoomNamesByMap {
  if (storage === undefined) {
    return {}
  }

  let raw: string | null

  try {
    raw = storage.getItem(ROOM_NAMES_KEY)
  } catch {
    return {}
  }

  if (raw === null || raw.trim() === '') {
    return {}
  }

  const parsed = parseJson(raw)

  if (!isRecord(parsed) || parsed.version !== STORAGE_VERSION) {
    return {}
  }

  const mapsValue = parsed.maps

  if (!isRecord(mapsValue)) {
    return {}
  }

  const maps: Record<string, StoredRoomNames> = {}

  for (const [id, value] of Object.entries(mapsValue)) {
    if (id.trim() === '') {
      continue
    }

    const names = roomNamesOfValue(value)

    if (names !== undefined) {
      maps[id] = names
    }
  }

  return maps
}

/**
 * Writes the names of one level into the browser, beside the names of the others.
 *
 * @remarks
 * A refused write keeps the names of the session in memory: the inspector goes on, and the next write may find room.
 *
 * @param id The value of the map.
 * @param names The names of the rooms, by the id of the room as a text.
 * @param storage The storage to write, the `localStorage` of the page by default.
 */
export function writeRoomNamesOf(
  id: string,
  names: StoredRoomNames,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  if (storage === undefined) {
    return
  }

  const maps = { ...readStoredRoomNames(storage), [id]: names }
  const value = JSON.stringify({ version: STORAGE_VERSION, maps })

  try {
    storage.setItem(ROOM_NAMES_KEY, value)
  } catch {
    // the names of the session stay in memory
  }
}

/**
 * Writes the names of a level the zip carried, so the level opens with them.
 *
 * @param id The value of the map.
 * @param names The names of the rooms.
 * @param storage The storage to write.
 */
export function seedRoomNamesOf(
  id: string,
  names: StoredRoomNames,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  writeRoomNamesOf(id, names, storage)
}
