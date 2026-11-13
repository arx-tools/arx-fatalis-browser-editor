import type { ArxMap } from '../../../generator/ArxMap.ts'
import { commandOf } from '../history/commands.ts'
import { createSetRoomRecord } from '../history/records.ts'
import { runStep } from '../level/edit/editing.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionStore } from '../selection/selectionStore.ts'

/**
 * The highest room id a level can hold.
 *
 * @remarks
 * The room of a face is a byte in the FTS, and the game reserves `-1` for a face without a room, so the last id a new
 * room can take is 254.
 */
export const MAX_ROOM_ID = 254

/**
 * A room a face can be moved into.
 */
export interface RoomTarget {
  /**
   * The id of the room.
   */
  readonly room: number
  /**
   * How many faces of the level are in it.
   */
  readonly faceCount: number
}

/**
 * The rooms of a level, with the number of their faces.
 *
 * @param map The level to read.
 *
 * @returns Every room the level has a face in, by id, the room without a face included only when the level shows it.
 */
export function roomTargetsOf(map: ArxMap): RoomTarget[] {
  const counts = new Map<number, number>()

  for (const polygon of map.polygons) {
    counts.set(polygon.room, (counts.get(polygon.room) ?? 0) + 1)
  }

  return [...counts]
    .filter(([room]) => {
      return room >= 0
    })
    .toSorted(([one], [other]) => {
      return one - other
    })
    .map(([room, faceCount]) => {
      return { room, faceCount }
    })
}

/**
 * The id a new room takes: the one after the highest the level has.
 *
 * @param map The level to read.
 *
 * @returns The id, or `undefined` when the level has no room left (it is at {@link MAX_ROOM_ID}).
 */
export function nextRoomIdOf(map: ArxMap): number | undefined {
  const targets = roomTargetsOf(map)
  const highest = targets.at(-1)?.room ?? 0
  const next = highest + 1

  if (next > MAX_ROOM_ID) {
    return undefined
  }

  return next
}

/**
 * Moves the selected faces into a room, as one step of the history.
 *
 * @param room The room the faces take, or `-1` to take them out of their room.
 *
 * @returns True when the step ran, false when there is nothing to move (no level, or no selected face).
 */
export function moveSelectionToRoom(room: number): boolean {
  const map = levelStore.map.value
  const faces = [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })

  if (map === undefined || faces.length === 0) {
    return false
  }

  const changes = faces.map((index) => {
    return { index, room: map.polygons[index]?.room ?? -1 }
  })
  const command = commandOf(createSetRoomRecord(changes, room), map)

  if (command === undefined) {
    return false
  }

  runStep(command)

  return true
}

/**
 * Makes a room of the selection: a new room with the next free id, the selected faces in it.
 *
 * @remarks
 * The two halves are one step (`setRoom`), so the undo takes the faces out without leaving a room behind: the id is not
 * written anywhere else, and a room nobody is in is not a room of the level.
 *
 * @returns The id of the new room, or `undefined` when there is nothing to move or the level has no id left.
 */
export function createRoomWithSelection(): number | undefined {
  const map = levelStore.map.value

  if (map === undefined || selectionStore.polygons.value.size === 0) {
    return undefined
  }

  const room = nextRoomIdOf(map)

  if (room === undefined) {
    return undefined
  }

  if (!moveSelectionToRoom(room)) {
    return undefined
  }

  return room
}
