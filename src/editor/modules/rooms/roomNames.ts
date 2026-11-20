import { shallowRef, type ShallowRef } from 'vue'
import { runMetadataStep, type HistoryCommand } from '../history/history.ts'
import { createSetRoomNameRecord, labelOf, type HistoryRecord } from '../history/records.ts'
import { writeRoomNamesOf } from './roomNamesStorage.ts'

/**
 * What a room without a name is called.
 *
 * @remarks
 * The id of a room is the engine's, the name is the author's (the decision of the room round, 166/4): an area without
 * a name is still an area, and the list says so with this text instead of an empty cell.
 */
export const UNNAMED_ROOM = 'Unnamed area'

/**
 * The names the author gave the rooms, by the id of the room.
 *
 * @remarks
 * A module level singleton. The names are metadata of the level, not a polygon edit: the step they make is a
 * **metadata** step of the history, so the undo takes a rename back without touching the level, and the records of the
 * names are not replayed on the level (the store writes them down for the browser, and the export for the zip). The
 * names of the zip a level came from are read into it when the level opens (`roomNamesStart.ts`).
 */
export const roomNames: ShallowRef<ReadonlyMap<number, string>> = shallowRef(new Map())

/**
 * The value of the map the names belong to, for the write of a change.
 *
 * @remarks
 * The store does not follow the map itself (it does not import the map list): the start of the names sets the id with
 * the names, so a rename knows which level it has to write.
 */
let activeMapId: string | undefined

/**
 * The fingerprint of the file the names belong to, for the write of a change.
 *
 * @remarks
 * A level number opens more than one file (the final release, a demo), and the names are the room ids of **that** file:
 * the fingerprint is what tells the write which version of the level it names, the way the history and the groups are
 * keyed. The names of a level whose file is not known yet (it is still loading) are not written.
 */
let activeFingerprint: string | undefined

/**
 * Whether the storage keeps names of this level on another version of its file.
 *
 * @remarks
 * A level that opens from another version starts without the names it had: the note of the inspector says why, and that
 * the other names are kept for their own version.
 */
export const roomNamesOnAnotherVersion = shallowRef(false)

/**
 * The name of a room, when the author gave one.
 *
 * @param room The id of the room.
 *
 * @returns The name, or `undefined` when the room has none.
 */
export function roomNameOf(room: number): string | undefined {
  return roomNames.value.get(room)
}

/**
 * What the list says about a room: its name, or {@link UNNAMED_ROOM}.
 *
 * @param room The id of the room.
 *
 * @returns The name of the room, or the text of the ones without a name.
 */
export function nameOf(room: number): string {
  return roomNameOf(room) ?? UNNAMED_ROOM
}

/**
 * Writes the names of the level that just opened, and remembers the level and its file.
 *
 * @param id The value of the map the names belong to.
 * @param fingerprint The fingerprint of the file the names belong to, or `undefined` while the file is not open.
 * @param names The names of the level.
 */
export function setRoomNamesOf(id: string, fingerprint: string | undefined, names: ReadonlyMap<number, string>): void {
  activeMapId = id
  activeFingerprint = fingerprint
  roomNames.value = names
}

/**
 * Writes the names of the open level down, so a reload and the export find them.
 */
function saveRoomNames(): void {
  if (activeMapId === undefined || activeFingerprint === undefined) {
    return
  }

  const names: Record<string, string> = {}

  for (const [room, name] of roomNames.value) {
    names[String(room)] = name
  }

  writeRoomNamesOf(activeMapId, activeFingerprint, names)

  // the storage has the names of this file now: the note of the other version has nothing to say
  roomNamesOnAnotherVersion.value = false
}

/**
 * Names a room, or takes its name away.
 *
 * @param room The id of the room.
 * @param name The name the author typed; an empty text takes the name away.
 */
export function renameRoom(room: number, name: string): void {
  const next = new Map(roomNames.value)
  const trimmed = name.trim()

  if (trimmed === '') {
    next.delete(room)
  } else {
    next.set(room, trimmed)
  }

  roomNames.value = next
  saveRoomNames()
}

/**
 * Forgets the names of rooms that are not in the level any more.
 *
 * @param rooms The rooms that went, `-1` and the ids of no room ignored.
 */
export function forgetRoomNames(rooms: Iterable<number>): void {
  const next = new Map(roomNames.value)
  let changed = false

  for (const room of rooms) {
    if (room >= 0 && next.delete(room)) {
      changed = true
    }
  }

  if (changed) {
    roomNames.value = next
    saveRoomNames()
  }
}

/**
 * Builds the step of a stored room rename.
 *
 * @remarks
 * The step is metadata: it writes the store of the names, so the replay of the level puts it back on the stack without
 * running it (the store already holds the name the reload found), and the halves run when the author undoes or redoes it.
 *
 * @param record The stored record.
 *
 * @returns The step, or `undefined` when the record is not a room rename.
 */
export function roomNameCommandOf(record: HistoryRecord): HistoryCommand | undefined {
  if (record.kind !== 'setRoomName') {
    return undefined
  }

  return {
    label: labelOf(record),
    record,
    metadata: true,
    apply: (): void => {
      renameRoom(record.room, record.to)
    },
    revert: (): void => {
      renameRoom(record.room, record.from)
    },
  }
}

/**
 * Renames a room as a step of the history.
 *
 * @remarks
 * The step is metadata: the undo takes it back without a revision of the level, and it is not written down with the
 * level's steps (the store of the names is the durable form). A name that does not change is not a step.
 *
 * @param room The id of the room.
 * @param name The name the author typed; an empty text takes the name away.
 */
export function renameRoomAsStep(room: number, name: string): void {
  const from = roomNameOf(room) ?? ''
  const to = name.trim()

  if (from === to) {
    return
  }

  const record = createSetRoomNameRecord(room, from, to)
  const command = roomNameCommandOf(record)

  if (command !== undefined) {
    runMetadataStep(command)
  }
}

/**
 * The names as the manifest writes them, by the id of the room as a text.
 *
 * @returns The names, or `undefined` when the level has none (the archive says nothing about the rooms then).
 */
export function roomNamesJson(): Record<string, string> | undefined {
  if (roomNames.value.size === 0) {
    return undefined
  }

  const names: Record<string, string> = {}

  for (const [room, name] of roomNames.value) {
    names[String(room)] = name
  }

  return names
}
