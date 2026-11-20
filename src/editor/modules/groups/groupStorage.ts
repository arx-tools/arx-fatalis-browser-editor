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
 * number is bumped when a stored value would be read wrong by an older or a newer build. Version 2 keys the groups of a
 * level by the fingerprint of the file they were made on, so the groups of the final release and of a demo of the same
 * level number stay apart.
 */
const STORAGE_VERSION = 2

/**
 * One group of faces, as the storage keeps it.
 *
 * @remarks
 * The faces are the **indices** of the level they were grouped on, the way the history stores them: the value only lines
 * up with the map it was written from, which is why the fingerprint of the file is part of the storage.
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
 * The groups of one file of a level.
 *
 * @remarks
 * A level of the game lives in more than one version beside each other (the final release, and e.g. a demo), and the
 * same map value opens whichever file the editor has: the fingerprint of the file is what tells the groups of the two
 * apart, the way it tells the stored history of the two apart.
 */
export type StoredVersionGroups = {
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
 * The groups of one level, by the fingerprint of every file it was opened as.
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
   * The groups of every file of the level, by the fingerprint of the file.
   *
   * @remarks
   * The groups of the other files are kept, not dropped: the author may switch between the versions of a level, and the
   * groups of the one the next visit opens are the groups that visit left there.
   */
  readonly versions: Readonly<Record<string, StoredVersionGroups>>
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
 * Reads the groups of one file, skipping the groups this build does not know.
 *
 * @param value The value the storage held.
 *
 * @returns The groups of that file, or `undefined` when the value is not one of this build.
 */
function storedVersionGroupsOf(value: unknown): StoredVersionGroups | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { nextId, groups } = value

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
  return { nextId: Math.max(nextId, highest + 1), groups: known }
}

/**
 * Reads the groups of one level, with the groups of every file it was opened as.
 *
 * @param value The value the storage held.
 *
 * @returns The level, or `undefined` when the value is not a level of this build.
 */
function storedMapGroupsOf(value: unknown): StoredMapGroups | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { title, versions } = value

  if (typeof title !== 'string' || !isRecord(versions)) {
    return undefined
  }

  const known: Record<string, StoredVersionGroups> = {}

  for (const [fingerprint, entry] of Object.entries(versions)) {
    if (fingerprint.trim() === '') {
      continue
    }

    const stored = storedVersionGroupsOf(entry)

    if (stored !== undefined) {
      known[fingerprint] = stored
    }
  }

  return { title, versions: known }
}

/**
 * Reads the groups of a file of a level.
 *
 * @param map The groups of the level, or `undefined` when the storage has none.
 * @param fingerprint The fingerprint of the file the level was loaded from.
 *
 * @returns The groups of that file, or `undefined` when the level was not grouped on this file.
 */
export function groupsOfVersion(
  map: StoredMapGroups | undefined,
  fingerprint: string,
): StoredVersionGroups | undefined {
  return map?.versions[fingerprint]
}

/**
 * Tells whether a level has stored groups on a file other than the one that is open.
 *
 * @param map The groups of the level, or `undefined` when the storage has none.
 * @param fingerprint The fingerprint of the file the level was loaded from.
 *
 * @returns True when the storage keeps the groups of another version of the level.
 */
export function hasGroupsOfAnotherVersion(map: StoredMapGroups | undefined, fingerprint: string): boolean {
  if (map === undefined) {
    return false
  }

  return Object.keys(map.versions).some((key) => {
    return key !== fingerprint
  })
}

/**
 * Puts the groups of one file into a level, keeping the groups of its other files.
 *
 * @param map The groups of the level, or `undefined` when the storage has none.
 * @param title The name of the level, the way the header writes it.
 * @param fingerprint The fingerprint of the file the groups belong to.
 * @param entry The groups of that file.
 *
 * @returns The level, with the groups of that file set.
 */
export function withGroupsOfVersion(
  map: StoredMapGroups | undefined,
  title: string,
  fingerprint: string,
  entry: StoredVersionGroups,
): StoredMapGroups {
  const versions: Record<string, StoredVersionGroups> = { ...map?.versions, [fingerprint]: entry }

  return { title, versions }
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
 * What a zip carries of the groups of its level, and where it belongs.
 */
export type FaceGroupSeed = {
  /**
   * The value of the map.
   */
  readonly id: string
  /**
   * The fingerprint of the file of the level the zip carries.
   */
  readonly fingerprint: string
  /**
   * The name of the level, the way the header writes it.
   */
  readonly title: string
  /**
   * The groups of the file.
   */
  readonly version: StoredVersionGroups
}

/**
 * Writes the groups of one file of a level, keeping the groups of its other files.
 *
 * @remarks
 * The editor seeds the storage with what a zip carried, so the store of the groups finds them when the level is whole.
 *
 * @param seed The groups the zip carried, and where they belong.
 * @param storage The storage to write, the `localStorage` of the page by default.
 */
export function seedFaceGroupsOf(
  seed: FaceGroupSeed,
  storage: StorageLike | undefined = getLocalStorage(undefined),
): void {
  const maps = readStoredGroups(storage)
  const next = {
    ...maps,
    [seed.id]: withGroupsOfVersion(maps[seed.id], seed.title, seed.fingerprint, seed.version),
  }

  writeStoredGroups(next, storage)
}
