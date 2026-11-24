import type { FaceRoom } from '../../../../generator/ArxMap.ts'
import {
  HISTORY_RECORD_VERSION,
  type DeleteRoomsRecord,
  type NamedRoom,
  type SetRoomNameRecord,
  type SetRoomRecord,
} from './types.ts'

/**
 * Builds the record of a room delete, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted by their index, and a face that comes twice is one (the same delete gives the same record
 * whatever order the selection held the rooms in). The portals are sorted and unique the same way.
 *
 * @param changes The faces the step takes out of their room, with the room they had.
 * @param portals The indices of the portals the step takes out with the rooms.
 * @param names The rooms that had a name, with the name they had.
 *
 * @returns The record of the step.
 */
export function createDeleteRoomsRecord(
  changes: Iterable<FaceRoom>,
  portals: Iterable<number>,
  names: Iterable<NamedRoom> = [],
): DeleteRoomsRecord {
  const rooms = new Map<number, number>()

  for (const change of changes) {
    if (!rooms.has(change.index)) {
      rooms.set(change.index, change.room)
    }
  }

  const sorted = [...rooms].toSorted((one, other) => {
    return one[0] - other[0]
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'deleteRooms',
    faces: sorted.map(([index]) => {
      return index
    }),
    from: sorted.map(([, room]) => {
      return room
    }),
    portals: [...new Set(portals)].toSorted((one, other) => {
      return one - other
    }),
    names: [...names].toSorted((one, other) => {
      return one.room - other.room
    }),
  }
}

/**
 * Builds the record of a room rename, the way a metadata step writes it down.
 *
 * @param room The id of the room.
 * @param from The name the room had.
 * @param to The name the room takes.
 *
 * @returns The record of the step.
 */
export function createSetRoomNameRecord(room: number, from: string, to: string): SetRoomNameRecord {
  return { version: HISTORY_RECORD_VERSION, kind: 'setRoomName', room, from, to }
}

/**
 * Builds the record of a room move, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted by their index, and the rooms they had follow them, so the same move gives the same record
 * whatever order the selection held the faces in.
 *
 * @param changes The faces the step moves and their rooms before the step.
 * @param to The room the faces take, or `-1` to take them out of their room.
 *
 * @returns The record of the step.
 */
export function createSetRoomRecord(changes: Iterable<FaceRoom>, to: number): SetRoomRecord {
  const sorted = [...changes].toSorted((one, other) => {
    return one.index - other.index
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'setRoom',
    faces: sorted.map((change) => {
      return change.index
    }),
    from: sorted.map((change) => {
      return change.room
    }),
    to,
  }
}
