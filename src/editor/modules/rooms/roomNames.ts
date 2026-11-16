import { shallowRef, watch, type ShallowRef } from 'vue'
import { currentMapId, currentMapManifest } from '../level/source/maps.ts'

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
 * A module level singleton, and **not** a step of the history: a name is metadata of the level (the same as the camera
 * pose), so renaming a room does not put an undo on the stack, and the export writes the names into the manifest
 * (`roomNames`) instead of the level files.
 *
 * The names of the zip a level came from are read into it when the level opens ({@link startRoomNames}), so an archive
 * that is exported again keeps the names it had.
 */
export const roomNames: ShallowRef<ReadonlyMap<number, string>> = shallowRef(new Map())

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
}

/**
 * Forgets the names of rooms that are not in the level any more.
 *
 * @remarks
 * A deleted room has no name to keep: a room made later takes the id again, and an old name on it would be a name the
 * author did not give to that room. A name is metadata, so this is not a step of the history either.
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

/**
 * Reads the names of the level the author opens.
 *
 * @remarks
 * The names travel in the manifest of the zip, so the store follows the map and its manifest: another level has another
 * manifest, and the names of the one before it are dropped with it.
 */
export function startRoomNames(): void {
  watch(
    [currentMapId, currentMapManifest],
    () => {
      const names = new Map<number, string>()

      for (const [room, name] of Object.entries(currentMapManifest.value?.roomNames ?? {})) {
        const id = Number.parseInt(room, 10)

        if (Number.isSafeInteger(id) && id >= 0) {
          names.set(id, name)
        }
      }

      roomNames.value = names
    },
    { immediate: true },
  )
}
