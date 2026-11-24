import type { FaceRoom } from '../../../generator/ArxMap.ts'
import { commandOf } from '../history/commands.ts'
import { createDeleteRoomsRecord } from '../history/records/rooms.ts'
import type { NamedRoom } from '../history/records/types.ts'
import { runStep } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { roomNameOf } from './roomNames.ts'

/**
 * Takes rooms out of the level.
 *
 * @remarks
 * The faces of a room stay in the level, and only their room goes: they become faces without a room, the way the game
 * reads a level with a room cut away. The portals of the rooms go with them (they name a room that is not there any
 * more), and the whole change is one step of the history, so the undo puts the rooms and their portals back together.
 *
 * A room's name is metadata, and the step carries the names it forgets: the undo brings the room back with its name.
 *
 * @param rooms The rooms to take out, `-1` and the ids of no room ignored.
 *
 * @returns True when the step ran, false when there is nothing to delete (no level, no room of the list).
 */
export function deleteRooms(rooms: readonly number[]): boolean {
  const map = levelStore.map.value
  const ids = new Set(
    rooms.filter((room) => {
      return room >= 0
    }),
  )

  if (map === undefined || ids.size === 0) {
    return false
  }

  const changes: FaceRoom[] = []
  const removedPortals: number[] = []
  const names: NamedRoom[] = []

  for (const room of ids) {
    const name = roomNameOf(room)

    if (name !== undefined) {
      names.push({ room, name })
    }
  }

  for (let index = 0; index < map.polygons.length; index = index + 1) {
    const polygon = map.polygons[index]

    if (polygon !== undefined && ids.has(polygon.room)) {
      changes.push({ index, room: polygon.room })
    }
  }

  for (const [index, portal] of map.portals.entries()) {
    if (ids.has(portal.room1) || ids.has(portal.room2)) {
      removedPortals.push(index)
    }
  }

  if (changes.length === 0 && removedPortals.length === 0) {
    return false
  }

  const command = commandOf(createDeleteRoomsRecord(changes, removedPortals, names), map)

  if (command === undefined) {
    return false
  }

  runStep(command)

  return true
}
