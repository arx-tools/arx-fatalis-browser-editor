import { parseJson } from '../persistedRef/functions.ts'
import { getLocalStorage, type StorageLike } from '../persistedRef/storage.ts'

/**
 * The key of the `localStorage` entry the groups live under.
 */
const GROUPS_KEY = 'faceGroups'

/**
 * The version of the stored shape.
 *
 * @remarks
 * A build does not guess at a shape it does not know: a value of another version is dropped, and the groups with it. The
 * number is bumped when a stored value would be read wrong by an older or a newer build.
 */
const STORAGE_VERSION = 1

/**
 * One group of faces, as the storage keeps it.
 *
 * @remarks
 * The faces are the **indices** of the level they were grouped on, the way the history stores them: the value only lines
 * up with the map it was written from, which is why the key of the level is part of the storage.
 */
export type StoredFaceGroup = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group.
   */
  readonly name: string
  /**
   * The indices of the faces of the group, in the order of the level.
   */
  readonly faces: readonly number[]
  /**
   * Whether the group is drawn; `false` is a group the author hid, and a missing value is a group of an older build,
   * which is visible.
   */
  readonly visible?: boolean
}

/**
 * The groups of one level.
 */
export type StoredMapGroups = {
  /**
   * The name of the level with its group, like `Arx: Level 8`, the way the header writes it.
   *
   * @remarks
   * The widget titles the section of a level that is not open with this text: the list of the maps may not have that
   * level any more (the zip of a previous session), and the title the author saw is better than a value of the storage.
   */
  readonly title: string
  /**
   * The id the next group of the level takes.
   */
  readonly nextId: number
  /**
   * The groups of the level, in the order they were made.
   */
  readonly groups: readonly StoredFaceGroup[]
}

/**
 * The groups of every level the author made one on, by the value of the map.
 */
export type StoredGroups = Readonly<Record<string, StoredMapGroups>>

/**
 * Tells whether a parsed value is an object the storage can carry.
 *
 * @param value The parsed value.
 *
 * @returns True for a plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Tells whether a value is a list of face indices.
 *
 * @param value The value to read.
 *
 * @returns True for an array of whole, non negative numbers.
 */
function isFaceList(value: unknown): value is number[] {
  if (!Array.isArray(value)) {
    return false
  }

  for (const face of value) {
    if (typeof face !== 'number' || !Number.isSafeInteger(face) || face < 0) {
      return false
    }
  }

  return true
}

/**
 * Reads one stored group.
 *
 * @param value The value the storage held.
 *
 * @returns The group, or `undefined` when the value is not one of this build.
 */
function storedFaceGroupOf(value: unknown): StoredFaceGroup | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { id, name, faces } = value

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    return undefined
  }

  if (typeof name !== 'string' || !isFaceList(faces)) {
    return undefined
  }

  const { visible } = value

  if (visible !== undefined && typeof visible !== 'boolean') {
    return undefined
  }

  // an older value has no flag, and the group it carries is visible: the key stays out of the shape
  if (visible === undefined) {
    return { id, name, faces }
  }

  return { id, name, faces, visible }
}

/**
 * Reads the groups of one level, skipping the groups this build does not know.
 *
 * @param value The value the storage held.
 *
 * @returns The groups of the level, or `undefined` when the value is not a level of this build.
 */
function storedMapGroupsOf(value: unknown): StoredMapGroups | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { title, nextId, groups } = value

  if (typeof title !== 'string') {
    return undefined
  }

  if (typeof nextId !== 'number' || !Number.isSafeInteger(nextId) || nextId < 1) {
    return undefined
  }

  if (!Array.isArray(groups)) {
    return undefined
  }

  const known: StoredFaceGroup[] = []
  let highest = 0

  for (const group of groups) {
    const stored = storedFaceGroupOf(group)

    if (stored === undefined) {
      continue
    }

    known.push(stored)
    highest = Math.max(highest, stored.id)
  }

  // a value that lost its next id to an older build gets one after its last group
  return { title, nextId: Math.max(nextId, highest + 1), groups: known }
}

/**
 * Reads the groups of every level from the browser.
 *
 * @param storage The storage to read, the `localStorage` of the page by default.
 *
 * @returns The groups by the value of the map; an empty object when the storage has none or refuses it.
 */
export function readStoredGroups(storage: StorageLike | undefined = getLocalStorage(undefined)): StoredGroups {
  if (storage === undefined) {
    return {}
  }

  let raw: string | null

  try {
    raw = storage.getItem(GROUPS_KEY)
  } catch {
    return {}
  }

  if (raw === null || raw.trim() === '') {
    return {}
  }

  const parsed = parseJson(raw)

  if (!isRecord(parsed)) {
    return {}
  }

  if (parsed.version !== STORAGE_VERSION) {
    return {}
  }

  const mapsValue = parsed.maps

  if (!isRecord(mapsValue)) {
    return {}
  }

  const maps: Record<string, StoredMapGroups> = {}

  for (const [id, value] of Object.entries(mapsValue)) {
    if (id.trim() === '') {
      continue
    }

    const entry = storedMapGroupsOf(value)

    if (entry !== undefined) {
      maps[id] = entry
    }
  }

  return maps
}

/**
 * Writes the groups of every level into the browser.
 *
 * @remarks
 * A refused write keeps the groups of the session in memory: the author can go on, and the next write may find room.
 *
 * @param maps The groups by the value of the map.
 * @param storage The storage to write, the `localStorage` of the page by default.
 */
export function writeStoredGroups(
  maps: StoredGroups,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  if (storage === undefined) {
    return
  }

  try {
    storage.setItem(GROUPS_KEY, JSON.stringify({ version: STORAGE_VERSION, maps }))
  } catch {
    // the groups of the session stay in memory
  }
}

/**
 * Writes the groups of one level, keeping the ones of the others.
 *
 * @remarks
 * The editor seeds the storage with what a zip carried, so the store of the groups finds them when the level is whole.
 *
 * @param id The value of the map.
 * @param entry The groups of the level.
 * @param storage The storage to write, the `localStorage` of the page by default.
 */
export function seedFaceGroupsOf(
  id: string,
  entry: StoredMapGroups,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  const maps = { ...readStoredGroups(storage), [id]: entry }

  writeStoredGroups(maps, storage)
}
