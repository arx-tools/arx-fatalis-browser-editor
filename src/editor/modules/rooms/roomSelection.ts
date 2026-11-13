import { watch } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { selectionStore } from '../selection/selectionStore.ts'
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
 * @param room The room to pick, or `undefined` to clear the pick and the selection.
 */
export function pickRoom(room: number | undefined): void {
  if (room === undefined) {
    selectRoom(undefined)
    selectionStore.clear()

    return
  }

  const map = levelStore.map.value

  selectRoom(room)

  if (map === undefined) {
    return
  }

  const faces = facesOfRoom(map, room)

  if (faces.length === 0) {
    return
  }

  selectionStore.selectMany(faces, 'replace')
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
