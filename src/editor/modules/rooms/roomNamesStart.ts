import { watch } from 'vue'
import { onMetadataStep } from '../history/history.ts'
import { currentMapId, currentMapManifest } from '../level/source/maps.ts'
import { roomNameCommandOf, setRoomNamesOf } from './roomNames.ts'
import { readStoredRoomNames, roomNamesOfValue } from './roomNamesStorage.ts'

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
 * Reads the names of the level that opens: the browser's names win over the manifest of the zip.
 *
 * @remarks
 * The names of a zip are written into the browser when the archive is opened (the reader seeds the storage), so the two
 * sources say the same thing for a level that came from a zip, and a level of the game has only the browser's. A name
 * the author typed is the newer of the two, and it is the one the browser holds; the manifest is the fallback of a zip
 * of an older build, which had its names there.
 */
export function startRoomNames(): void {
  onMetadataStep(roomNameCommandOf)

  watch(
    [currentMapId, currentMapManifest],
    () => {
      const id = currentMapId.value
      const stored = readStoredRoomNames()[id]

      if (stored !== undefined) {
        setRoomNamesOf(id, namesOf(stored))

        return
      }

      setRoomNamesOf(id, namesOf(currentMapManifest.value?.roomNames))
    },
    { immediate: true },
  )
}
