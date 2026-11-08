import { shallowRef, type ShallowRef } from 'vue'
import type { HistoryRecord } from './records.ts'

/**
 * The steps of a map, and how many of them are on it.
 *
 * @remarks
 * The steps of the history are a line, not a stack: the ones taken back are still there, and the author can make them
 * again. A reload may only keep the **position** of that line, so the steps and the number of the applied ones are
 * written together: the ones after the position are the redo of the author.
 */
export interface HistorySnapshot {
  /**
   * The steps of the map, oldest first, the ones taken back included.
   */
  readonly records: readonly HistoryRecord[]
  /**
   * How many of the steps are on the level: the length of the part the undo takes back.
   */
  readonly position: number
}

/**
 * The steps of every map the editor opened, by the value of the map in the list.
 *
 * @remarks
 * A step of the history is a pair of closures over the map it was made on, so the steps can not be kept alive with the
 * map: the **records** are the durable shape (see {@link HistoryRecord}), and they are replayed on the map when it is
 * opened again. That is the same shape the persistence writes down, so this list is the one the two share.
 */
export const mapHistoryRecords: ShallowRef<ReadonlyMap<string, HistorySnapshot>> = shallowRef(new Map())

/**
 * Writes down the steps of a map, or forgets the map when it has none.
 *
 * @param id The value of the map in the list.
 * @param snapshot The steps of the map and how many of them are on it.
 */
export function rememberMapHistory(id: string, snapshot: HistorySnapshot): void {
  const next = new Map(mapHistoryRecords.value)

  if (snapshot.records.length === 0) {
    next.delete(id)
  } else {
    next.set(id, { records: [...snapshot.records], position: snapshot.position })
  }

  mapHistoryRecords.value = next
}

/**
 * Reads the steps of a map.
 *
 * @param id The value of the map in the list.
 *
 * @returns The steps of the map and how many of them are on it, or `undefined` when the map has none.
 */
export function historyOfMap(id: string): HistorySnapshot | undefined {
  return mapHistoryRecords.value.get(id)
}
