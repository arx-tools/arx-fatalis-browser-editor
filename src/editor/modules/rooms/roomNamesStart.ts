import type { ArxMap } from '../../../generator/ArxMap.ts'
import { onMetadataStep } from '../history/history.ts'
import { roomNameCommandOf, roomNamesOnAnotherVersion, setRoomNamesOf } from './roomNames.ts'
import {
  hasRoomNamesOfAnotherVersion,
  readStoredRoomNames,
  roomNamesOfValue,
  roomNamesOfVersion,
} from './roomNamesStorage.ts'

/**
 * Turns the names of a level into the map the store keeps, by the id of the room.
 *
 * @param value The names by the id of the room as a text.
 *
 * @returns The names by the id of the room.
 */
function namesOf(value: unknown): Map<number, string> {
  const names = new Map<number, string>()
  const parsed = roomNamesOfValue(value)

  if (parsed === undefined) {
    return names
  }

  for (const [room, name] of Object.entries(parsed)) {
    const id = Number.parseInt(room, 10)

    if (Number.isSafeInteger(id) && id >= 0) {
      names.set(id, name)
    }
  }

  return names
}

/**
 * Reads the names of the level that just opened, and writes them into the store.
 *
 * @remarks
 * The names are the room ids of the file the level was loaded from, so the read is by the fingerprint of that file: the
 * names of another version of the level are kept for their own version, and the inspector says so. The callers run this
 * once the map is on the store and the id of the level is set (a level of the game takes its id before its files
 * arrive, so the two are known together only after the load).
 *
 * The browser wins over the manifest of the zip: the reader of a zip seeds the browser with the names of the archive, so
 * the two say the same thing for a level that came from one, and a name the author typed afterwards is the newer. The
 * manifest is the fallback of a zip of an older build, which had its names there.
 *
 * @param id The value of the map.
 * @param map The map that just opened, or `undefined` when the level did not load.
 * @param manifestNames The names the manifest of the archive carries, the fallback of an older zip.
 */
export function loadRoomNamesOf(id: string, map: ArxMap | undefined, manifestNames: unknown): void {
  if (map === undefined) {
    roomNamesOnAnotherVersion.value = false
    setRoomNamesOf(id, undefined, new Map())

    return
  }

  const { fingerprint } = map
  const stored = readStoredRoomNames()[id]
  const names = roomNamesOfVersion(stored, fingerprint)

  roomNamesOnAnotherVersion.value = names === undefined && hasRoomNamesOfAnotherVersion(stored, fingerprint)
  setRoomNamesOf(id, fingerprint, namesOf(names ?? manifestNames))
}

/**
 * Starts the names of the rooms: the step that writes a rename down.
 *
 * @remarks
 * The names are read when a level opens ({@link loadRoomNamesOf}), not by a watch of the value of the map: a level of
 * the game sets its id before its files arrive, and the fingerprint the names are keyed by only exists once the map is on
 * the store. The step of a rename is metadata, so the undo takes it back without touching the level.
 */
export function startRoomNames(): void {
  onMetadataStep(roomNameCommandOf)
}
