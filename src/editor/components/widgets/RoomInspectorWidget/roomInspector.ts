import type { ArxMap } from '../../../../generator/ArxMap.ts'
import {
  roomColoringForLevel,
  roomIdsOf,
  roomPaletteOf,
  roomSummaryOf,
  type RoomSummary,
} from '../../../../generator/rooms.ts'
import { formatCount } from '../../../modules/format.ts'

/**
 * The colour a face without a room takes in the list.
 *
 * @remarks
 * The same grey the room map paints such a face with, so the list and the view agree.
 */
const UNKNOWN_COLOR = '#9a9a9a'

/**
 * How serious a problem of the level is.
 */
export type ProblemKind = 'info' | 'warning'

/**
 * One line of the problems of the level.
 */
export interface RoomProblem {
  /**
   * Whether the line reports something the author should fix, or only explains the level.
   */
  readonly kind: ProblemKind
  /**
   * The line the panel shows.
   */
  readonly text: string
}

/**
 * One room of the room inspector.
 */
export interface RoomRow extends RoomSummary {
  /**
   * The colour the room map paints the room with.
   */
  readonly color: string
}

/**
 * Builds the rows of the room inspector.
 *
 * @remarks
 * The colour is the one the room map paints the room with: the same colouring, keyed with the same id of the level, so
 * the list and the view can not disagree.
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
 * Writes how many faces a room holds, the way the list shows it.
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
 * Collects what is wrong with the rooms of a level.
 *
 * @remarks
 * The list is the same wherever the problems are shown (the panel now, the export dialog later): one line per thing the
 * author can not see in the view. The wording has to say **when** a thing is a problem, because a level can be right
 * with one room (an open one, without walls to reach through) and a level with many rooms can be wrong (a face in a room
 * its neighbours are not in).
 *
 * @param map The level to read.
 *
 * @returns The problems, the serious ones first.
 */
export function roomProblemsOf(map: ArxMap): RoomProblem[] {
  const problems: RoomProblem[] = []
  const rooms = roomSummaryOf(map.polygons)

  const lost = map.polygons.filter((polygon) => {
    return polygon.room < 0
  }).length

  if (lost > 0) {
    problems.push({
      kind: 'warning',
      text: `${formatCount(lost)} faces have no room: the game never draws them.`,
    })
  }

  if (rooms.length === 1) {
    problems.push({
      kind: 'info',
      text: 'One room: an open level does not need more. Behind a wall, the player can reach through it.',
    })
  }

  if (rooms.length > 1) {
    const linked = new Set<number>()

    for (const portal of map.fts.portals) {
      linked.add(portal.room1)
      linked.add(portal.room2)
    }

    const alone = rooms
      .filter((room) => {
        return !linked.has(room.room)
      })
      .map((room) => {
        return room.room
      })

    if (alone.length > 0) {
      problems.push({
        kind: 'warning',
        text: `room ${alone.join(', ')} has no opening: the game draws it only while the player is in it.`,
      })
    }
  }

  return problems
}
