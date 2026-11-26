import type { ArxVector3 } from 'arx-convert/types'
import { HISTORY_RECORD_VERSION, type EntityPositionEdit, type SetEntityPositionRecord } from './types.ts'

/**
 * Copies a place of a step, so the record does not share the vector of the level.
 *
 * @param position The place to copy.
 *
 * @returns The place, with numbers of its own.
 */
function copyPositionOf(position: ArxVector3): ArxVector3 {
  return { x: position.x, y: position.y, z: position.z }
}

/**
 * Builds the record of an entity move, the way a step writes it down.
 *
 * @remarks
 * The entities are sorted by their index and an entity that comes twice is one, so the same selection gives the same
 * record whatever order the store held it in (the rule of the light records). The two places are copied: the map keeps
 * the live vector of the entity, and a later edit of it must not reach back into the step.
 *
 * @param edits The entities the step moves, with their two places.
 *
 * @returns The record of the step.
 */
export function createSetEntityPositionRecord(edits: Iterable<EntityPositionEdit>): SetEntityPositionRecord {
  const byIndex = new Map<number, EntityPositionEdit>()

  for (const edit of edits) {
    if (!byIndex.has(edit.index)) {
      byIndex.set(edit.index, edit)
    }
  }

  const sorted = byIndex
    .values()
    .toArray()
    .toSorted((one, other) => {
      return one.index - other.index
    })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'setEntityPosition',
    indices: sorted.map((edit) => {
      return edit.index
    }),
    before: sorted.map((edit) => {
      return copyPositionOf(edit.before)
    }),
    after: sorted.map((edit) => {
      return copyPositionOf(edit.after)
    }),
  }
}
