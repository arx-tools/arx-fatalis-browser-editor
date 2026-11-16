import type { ArxMap } from '../../../generator/ArxMap.ts'
import {
  roomColoringForLevel,
  roomIdsOf,
  roomPaletteOf,
  roomSummaryOf,
  type RoomSummary,
} from '../../../generator/rooms.ts'
import { formatCount } from '../format.ts'
import { nameOf } from './roomNames.ts'

/**
 * The colour a room without one takes in the list.
 *
 * @remarks
 * The same grey the room map paints a face without a room with, so the list and the view agree.
 */
const UNKNOWN_COLOR = '#9a9a9a'

/**
 * The id the faces without a room stand under in the list.
 *
 * @remarks
 * The game reads a negative room as a face no room holds, and the list gives those faces a row of their own at the top
 * (2026-11-15, the owner: the faces outside every room could not be picked from the list): the row stands under this id,
 * so the pick, the highlight and the moves read it as a room.
 */
export const NO_ROOM = -1

/**
 * One row of a list of rooms.
 */
export type RoomRow = RoomSummary & {
  /**
   * The colour the room map paints the room with.
   */
  readonly color: string
}

/**
 * Builds the rows of a list of rooms.
 *
 * @remarks
 * The colour is the one the room map paints the room with: the same colouring, keyed with the room id, so the list and
 * the view can not disagree. The rows are the rooms a face of the level is in: a room without a face is not a room of
 * the level. The faces no room holds come first, under {@link NO_ROOM}, so the list can pick them like a room.
 *
 * @param map The level to read.
 *
 * @returns One row for every room the level uses, in the order of their ids, the faces without a room first.
 */
export function roomRowsOf(map: ArxMap): RoomRow[] {
  const rooms = roomIdsOf(
    map.polygons.map((polygon) => {
      return polygon.room
    }),
  )
  const coloring = roomColoringForLevel(rooms)
  const rows = roomSummaryOf(map.polygons).map((summary) => {
    return {
      ...summary,
      color: roomPaletteOf(summary.room, coloring) ?? UNKNOWN_COLOR,
    }
  })
  const lost = map.polygons.filter((polygon) => {
    return polygon.room < 0
  }).length

  if (lost > 0) {
    rows.unshift({ room: NO_ROOM, faceCount: lost, color: UNKNOWN_COLOR })
  }

  return rows
}

/**
 * Writes how many faces a room holds, the way a list of rooms shows it.
 *
 * @remarks
 * The count is the faces of the level, not the triangles of the renderer: a quad is one face in the files and in the
 * game, and the two triangles it is drawn with are a detail of the view.
 *
 * @param faceCount How many faces the room holds.
 *
 * @returns The count with its unit, e.g. `1 571 faces`.
 */
export function faceCountLabelOf(faceCount: number): string {
  if (faceCount === 1) {
    return '1 face'
  }

  return `${formatCount(faceCount)} faces`
}

/**
 * The text a search of a room list reads: the number of the room and its name.
 *
 * @remarks
 * The id is searched as the list writes it (`room 12`), and the name as the author typed it, so a search finds a room
 * by its number and by its name alike.
 *
 * @param row The row to read.
 *
 * @returns The text of the row, e.g. `room 12 The yard`.
 */
export function roomSearchTextOf(row: RoomRow): string {
  if (row.room === NO_ROOM) {
    return 'no room'
  }

  return `room ${row.room.toString()} ${nameOf(row.room)}`
}

/**
 * The rows of a room list a search lets through.
 *
 * @remarks
 * Every word of the search has to be in the text of the row ({@link roomSearchTextOf}), the way the search of the texture
 * list reads its words: a search of `room 12` finds the room, and a search of `yard` finds the name. The order of the
 * list is kept: a room list is read by the ids of the rooms, not by the score of a match.
 *
 * @param rows The rows of the list.
 * @param query What the author typed into the search field.
 *
 * @returns The rows the search lets through, in the order they came in.
 */
export function filteredRoomRows(rows: readonly RoomRow[], query: string): readonly RoomRow[] {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => {
      return word !== ''
    })

  if (words.length === 0) {
    return rows
  }

  return rows.filter((row) => {
    const text = roomSearchTextOf(row).toLowerCase()

    return words.every((word) => {
      return text.includes(word)
    })
  })
}
