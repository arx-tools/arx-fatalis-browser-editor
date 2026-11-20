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
 * the names of a level, not the level. Version 2 keys the names of a level by the fingerprint of the file they were made
 * on, so the names of the final release and of a demo of the same level number stay apart.
 */
const STORAGE_VERSION = 2

/**
 * The names of the rooms of one level, by the id of the room as a text.
 */
export type StoredRoomNames = Readonly<Record<string, string>>

/**
 * The names of the rooms of one level, by the fingerprint of every file it was opened as.
 *
 * @remarks
 * A level of the game lives in more than one version beside each other, and a room id is only the same room in the same
 * file: the fingerprint tells the names of the two apart, the way it tells the groups and the stored history apart.
 */
export type StoredMapRoomNames = {
  /**
   * The names of every file of the level, by the fingerprint of the file.
   *
   * @remarks
   * The names of the other files are kept, not dropped: the author may switch between the versions of a level, and the
   * names of the one the next visit opens are the names that visit left there.
   */
  readonly versions: Readonly<Record<string, StoredRoomNames>>
}

/**
 * The names of the rooms of every level, by the value of the map.
 */
export type StoredRoomNamesByMap = Readonly<Record<string, StoredMapRoomNames>>

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
 * Reads the names of one level, with the names of every file it was opened as.
 *
 * @param value The value the storage held.
 *
 * @returns The level, or `undefined` when the value is not a level of this build.
 */
function storedMapRoomNamesOf(value: unknown): StoredMapRoomNames | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { versions } = value

  if (!isRecord(versions)) {
    return undefined
  }

  const known: Record<string, StoredRoomNames> = {}

  for (const [fingerprint, names] of Object.entries(versions)) {
    if (fingerprint.trim() === '') {
      continue
    }

    const parsed = roomNamesOfValue(names)

    if (parsed !== undefined) {
      known[fingerprint] = parsed
    }
  }

  return { versions: known }
}

/**
 * Reads the names of a file of a level.
 *
 * @param map The names of the level, or `undefined` when the storage has none.
 * @param fingerprint The fingerprint of the file the level was loaded from.
 *
 * @returns The names of that file, or `undefined` when the level was not named on this file.
 */
export function roomNamesOfVersion(
  map: StoredMapRoomNames | undefined,
  fingerprint: string,
): StoredRoomNames | undefined {
  return map?.versions[fingerprint]
}

/**
 * Tells whether a level has stored names on a file other than the one that is open.
 *
 * @param map The names of the level, or `undefined` when the storage has none.
 * @param fingerprint The fingerprint of the file the level was loaded from.
 *
 * @returns True when the storage keeps the names of another version of the level.
 */
export function hasRoomNamesOfAnotherVersion(map: StoredMapRoomNames | undefined, fingerprint: string): boolean {
  if (map === undefined) {
    return false
  }

  return Object.keys(map.versions).some((key) => {
    return key !== fingerprint
  })
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

  const maps: Record<string, StoredMapRoomNames> = {}

  for (const [id, value] of Object.entries(mapsValue)) {
    if (id.trim() === '') {
      continue
    }

    const names = storedMapRoomNamesOf(value)

    if (names !== undefined) {
      maps[id] = names
    }
  }

  return maps
}

/**
 * Writes the names of the rooms of one file of a level into the browser, beside the names of the others.
 *
 * @remarks
 * A refused write keeps the names of the session in memory: the inspector goes on, and the next write may find room.
 *
 * @param id The value of the map.
 * @param fingerprint The fingerprint of the file the names belong to.
 * @param names The names of the rooms, by the id of the room as a text.
 * @param storage The storage to write, the `localStorage` of the page by default.
 */
export function writeRoomNamesOf(
  id: string,
  fingerprint: string,
  names: StoredRoomNames,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  if (storage === undefined) {
    return
  }

  const maps = readStoredRoomNames(storage)
  const versions: Record<string, StoredRoomNames> = { ...maps[id]?.versions, [fingerprint]: names }
  const value = JSON.stringify({ version: STORAGE_VERSION, maps: { ...maps, [id]: { versions } } })

  try {
    storage.setItem(ROOM_NAMES_KEY, value)
  } catch {
    // the names of the session stay in memory
  }
}

/**
 * Writes the names of a file of a level the zip carried, so the level opens with them.
 *
 * @param id The value of the map.
 * @param fingerprint The fingerprint of the file of the level the zip carries.
 * @param names The names of the rooms.
 * @param storage The storage to write.
 */
export function seedRoomNamesOf(
  id: string,
  fingerprint: string,
  names: StoredRoomNames,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  writeRoomNamesOf(id, fingerprint, names, storage)
}
