import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { roomSummaryOf } from '../../../../generator/rooms.ts'
import { formatCount } from '../../../modules/format.ts'

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
