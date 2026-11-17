import { EDITOR_FOLDER } from './level/source/editorSettings.ts'
import { roomNamesOfValue, type StoredRoomNames } from './rooms/roomNamesStorage.ts'

/**
 * The path of the file the names of the rooms are kept in inside a zip.
 */
export const EDITOR_ROOMS_PATH = `${EDITOR_FOLDER}rooms.json`

/**
 * The path of the file the groups of faces are kept in inside a zip.
 */
export const EDITOR_GROUPS_PATH = `${EDITOR_FOLDER}groups.json`

/**
 * The version of the two files.
 *
 * @remarks
 * A file of another version is dropped instead of guessed at: the names and the groups are metadata, and a lost file
 * costs the author a rename, not the level.
 */
const STORAGE_VERSION = 1

/**
 * One group of faces, the way the file of the archive holds it.
 */
export type EditorGroup = {
  /**
   * The id of the group inside its level.
   */
  readonly id: number
  /**
   * The name the author gave the group; an empty text means the default of the id.
   */
  readonly name: string
  /**
   * The indices of the faces of the group.
   */
  readonly faces: readonly number[]
}

/**
 * The file the names of the rooms are kept in.
 */
export type EditorRoomsFile = {
  /**
   * The version of the shape.
   */
  readonly version: number
  /**
   * The names, by the id of the room as a text.
   */
  readonly roomNames: StoredRoomNames
}

/**
 * The file the groups of faces are kept in.
 */
export type EditorGroupsFile = {
  /**
   * The version of the shape.
   */
  readonly version: number
  /**
   * The groups of the level.
   */
  readonly groups: readonly EditorGroup[]
}

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
 * Reads one group of the file.
 *
 * @param value The value the file held.
 *
 * @returns The group, or `undefined` when the value is not one of this build.
 */
function editorGroupOf(value: unknown): EditorGroup | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const { id, name, faces } = value

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1) {
    return undefined
  }

  if (typeof name !== 'string' || !Array.isArray(faces)) {
    return undefined
  }

  for (const face of faces) {
    if (typeof face !== 'number' || !Number.isSafeInteger(face) || face < 0) {
      return undefined
    }
  }

  return { id, name, faces }
}

/**
 * Builds the file the names of the rooms are kept in.
 *
 * @param names The names of the rooms, by the id of the room as a text.
 *
 * @returns The file.
 */
export function editorRoomsJsonOf(names: StoredRoomNames | undefined): EditorRoomsFile {
  return { version: STORAGE_VERSION, roomNames: names ?? {} }
}

/**
 * Builds the file the groups of faces are kept in.
 *
 * @param groups The groups of the level.
 *
 * @returns The file.
 */
export function editorGroupsJsonOf(groups: readonly EditorGroup[] | undefined): EditorGroupsFile {
  return { version: STORAGE_VERSION, groups: groups ?? [] }
}

/**
 * Reads the file the names of the rooms are kept in.
 *
 * @param value The parsed file.
 *
 * @returns The names, or `undefined` when the file is not one of this build.
 */
export function roomNamesOfEditorFile(value: unknown): StoredRoomNames | undefined {
  if (!isRecord(value) || value.version !== STORAGE_VERSION) {
    return undefined
  }

  return roomNamesOfValue(value.roomNames)
}

/**
 * Reads the file the groups of faces are kept in.
 *
 * @param value The parsed file.
 *
 * @returns The groups, or `undefined` when the file is not one of this build.
 */
export function groupsOfEditorFile(value: unknown): EditorGroup[] | undefined {
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !Array.isArray(value.groups)) {
    return undefined
  }

  const groups: EditorGroup[] = []

  for (const group of value.groups) {
    const parsed = editorGroupOf(group)

    if (parsed !== undefined) {
      groups.push(parsed)
    }
  }

  return groups
}
