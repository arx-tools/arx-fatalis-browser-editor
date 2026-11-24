import type { ArxLight } from 'arx-convert/types'
import { HISTORY_RECORD_VERSION, type SetLightEdit, type SetLightRecord } from './types.ts'

/**
 * Copies a light of a step, so the record does not share the vectors of the level.
 *
 * @param light The light to copy.
 *
 * @returns A light with vectors of its own.
 */
function copyLightOf(light: ArxLight): ArxLight {
  return {
    ...light,
    position: { ...light.position },
    color: { ...light.color },
    exFlicker: { ...light.exFlicker },
  }
}

/**
 * Builds the record of a light edit, the way a step writes it down.
 *
 * @remarks
 * The lights are sorted by their index and a light that comes twice is one, so the same selection gives the same record
 * whatever order the store held it in. The two snapshots are copied: the map keeps the live light, and a later edit of
 * it must not reach back into the step.
 *
 * @param edits The lights the step writes, with their two snapshots.
 *
 * @returns The record of the step.
 */
export function createSetLightRecord(edits: Iterable<SetLightEdit>): SetLightRecord {
  const byIndex = new Map<number, SetLightEdit>()

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
    kind: 'setLight',
    indices: sorted.map((edit) => {
      return edit.index
    }),
    before: sorted.map((edit) => {
      return copyLightOf(edit.before)
    }),
    after: sorted.map((edit) => {
      return copyLightOf(edit.after)
    }),
  }
}
