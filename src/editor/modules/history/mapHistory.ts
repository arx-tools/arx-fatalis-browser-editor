import { shallowRef, type ShallowRef } from 'vue'
import type { HistoryRecord } from './records.ts'

/**
 * The steps of every map the editor opened, by the value of the map in the list.
 *
 * @remarks
 * A step of the history is a pair of closures over the map it was made on, so the steps can not be kept alive with the
 * map: the **records** are the durable shape (see {@link HistoryRecord}), and they are replayed on the map when it is
 * opened again. That is the same shape the persistence of a later round writes down, so this list is the one the two
 * share.
 */
export const mapHistoryRecords: ShallowRef<ReadonlyMap<string, readonly HistoryRecord[]>> = shallowRef(new Map())

/**
 * Writes down the steps of a map, or forgets the map when it has none.
 *
 * @param id The value of the map in the list.
 * @param records The steps of the map, oldest first.
 */
export function rememberMapHistory(id: string, records: readonly HistoryRecord[]): void {
  const next = new Map(mapHistoryRecords.value)

  if (records.length === 0) {
    next.delete(id)
  } else {
    next.set(id, [...records])
  }

  mapHistoryRecords.value = next
}

/**
 * Reads the steps of a map.
 *
 * @param id The value of the map in the list.
 *
 * @returns The steps, oldest first, or an empty list when the map has none.
 */
export function historyOfMap(id: string): readonly HistoryRecord[] {
  return mapHistoryRecords.value.get(id) ?? []
}
