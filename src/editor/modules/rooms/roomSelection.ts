import { watch } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { selectionStore, type SelectionMode } from '../selection/selectionStore.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectRoom, selectRooms } from './roomStore.ts'

/**
 * The faces of a room.
 *
 * @param map The level to read.
 * @param room The id of the room.
 *
 * @returns The indices of the polygons in the room, in the order of the level.
 */
export function facesOfRoom(map: ArxMap, room: number): number[] {
  const faces: number[] = []

  for (let index = 0; index < map.polygons.length; index = index + 1) {
    if (map.polygons[index]?.room === room) {
      faces.push(index)
    }
  }

  return faces
}

/**
 * The rooms the faces of a selection are in.
 *
 * @param map The level to read.
 * @param faces The selected polygons.
 *
 * @returns The ids of their rooms, which is an empty set when nothing is selected.
 */
export function roomsOfFaces(map: ArxMap, faces: ReadonlySet<number>): Set<number> {
  const rooms = new Set<number>()

  for (const face of faces) {
    const room = map.polygons[face]?.room

    if (room !== undefined) {
      rooms.add(room)
    }
  }

  return rooms
}

/**
 * Picks a room: highlights it and selects its faces, or clears both.
 *
 * @remarks
 * The pick and the selection are one thing (`startRoomSelection` keeps them together): a room the author clicks
 * selects its faces, so the faces of the room arrive in the view highlighted by the selection. A room without a face
 * keeps the pick without touching the selection, because selecting nothing would take the pick back at once.
 *
 * A `Shift` click adds the faces of the room to the selection and a `Ctrl`/`Meta` click takes them away, the same
 * modes the walkable view uses. The pick of the list is written directly only for a plain click: with more than one
 * room selected there is no single room to name, and the selection watcher derives the lit rooms from the faces.
 *
 * @param room The room to pick, or `undefined` to clear the pick and the selection.
 * @param mode Whether the room replaces the selection, adds to it or is taken out of it.
 */
export function pickRoom(room: number | undefined, mode: SelectionMode = 'replace'): void {
  if (room === undefined) {
    selectRoom(undefined)
    selectionStore.clear()

    return
  }

  const map = levelStore.map.value

  if (mode === 'replace') {
    selectRoom(room)
  }

  if (map === undefined) {
    return
  }

  const faces = facesOfRoom(map, room)

  if (faces.length === 0) {
    return
  }

  selectionStore.selectMany(faces, mode)
}

/**
 * Keeps the highlighted rooms on the rooms of the selection.
 *
 * @remarks
 * The other half of {@link pickRoom}: a gesture (a click, a rectangle, a double click) writes the selection, and the
 * rooms the selected faces are in become the lit ones, so the list and the room map follow the author. A selection of
 * no face clears the pick, and a selection that spans rooms lights all of them.
 *
 * The watch is on the **selection** and not on the level: a room the author picks is a face selection, and the level
 * arriving gives the faces their rooms, which the next selection reads.
 */
export function startRoomSelection(): void {
  watch(
    () => {
      return selectionStore.polygons.value
    },
    (faces) => {
      const map = levelStore.map.value

      if (map === undefined) {
        return
      }

      selectRooms(roomsOfFaces(map, faces))
    },
  )
}
