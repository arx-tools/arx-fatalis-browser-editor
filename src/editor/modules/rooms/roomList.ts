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
 * One row of a list of rooms.
 */
export interface RoomRow extends RoomSummary {
  /**
   * The colour the room map paints the room with.
   */
  readonly color: string
}

/**
 * Builds the rows of a list of rooms.
 *
 * @remarks
 * The colour is the one the room map paints the room with: the same colouring, keyed with the same id of the level, so
 * the list and the view can not disagree. The rows are the rooms a face of the level is in: a room without a face is not
 * a room of the level.
 *
 * @param map The level to read.
 * @param mapId The id of the level in the editor.
 *
 * @returns One row for every room the level uses, in the order of their ids.
 */
export function roomRowsOf(map: ArxMap, mapId: string): RoomRow[] {
  const rooms = roomIdsOf(
    map.polygons.map((polygon) => {
      return polygon.room
    }),
  )
  const coloring = roomColoringForLevel(map.fts.portals, rooms, mapId)

  return roomSummaryOf(map.polygons).map((summary) => {
    return {
      ...summary,
      color: roomPaletteOf(summary.room, coloring) ?? UNKNOWN_COLOR,
    }
  })
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
