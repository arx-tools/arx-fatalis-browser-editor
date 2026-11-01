import type { ArxPolygon } from 'arx-convert/types'
import type { PolygonInsertion } from '../../../generator/ArxMap.ts'
import type { HistoryCommand } from './history.ts'

/**
 * The version of the shape a stored step has.
 *
 * @remarks
 * A step is written as JSON (the persistence will come), and a build must not guess at a step it does not know: a
 * record of **this** version is the only one it reads, anything else is skipped. The number is bumped when the shape
 * of a record changes in a way an older or a newer build would read wrong.
 */
export const HISTORY_RECORD_VERSION = 1

/**
 * A step the way a JSON can hold it.
 *
 * @remarks
 * The command of the editor is a pair of closures (`apply`/`revert`), and a closure can not be written to a file. A
 * record is the **description** of the same step: the plain data it needs, without the code. Every command carries
 * one (see {@link HistoryCommand.record}), so what can be undone is exactly what can be stored — the two can not
 * drift apart.
 *
 * The union grows with the kinds of the steps: `deleteFaces` today, `moveVertex`, `setTexture`, `moveLight` and the
 * rest as they arrive.
 */
export type HistoryRecord = {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'deleteFaces'
  /**
   * The faces the step takes out, by their index in the level.
   *
   * @remarks
   * The indices are the ones of the moment the step was made, and a replay walks the steps in the same order from
   * the same level, so it finds the same faces: that is why the polygons themselves are not in the record (a level
   * of 70 000 polygons would be megabytes, a list of indices is a few hundred bytes).
   */
  readonly faces: readonly number[]
}

/**
 * The part of the level a step may touch.
 *
 * @remarks
 * A step works on the level, but only on the side of it a command is allowed to change. Naming that side here keeps
 * the commands (and their tests) away from the whole `ArxMap` — a fake with three polygons is enough to prove that a
 * step goes out and comes back.
 */
export interface MutableLevel {
  /**
   * Every polygon of the level, in the order of the mesh.
   */
  readonly polygons: readonly ArxPolygon[]
  /**
   * Takes polygons out, by identity.
   *
   * @param polygons The polygons to take out.
   */
  removePolygons(polygons: readonly ArxPolygon[]): void
  /**
   * Puts polygons back at the indices they were taken from.
   *
   * @param insertions The polygons and their places.
   */
  insertPolygons(insertions: readonly PolygonInsertion[]): void
}

/**
 * Builds the record of a delete, the way a step writes it down.
 *
 * @remarks
 * The indices are sorted and made unique, so the same set of faces gives the same record whatever order the
 * selection held them in — two steps that do the same thing are the same JSON.
 *
 * @param faces The indices of the faces the step takes out.
 *
 * @returns The record of the step.
 */
export function createDeleteFacesRecord(faces: Iterable<number>): HistoryRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return { version: HISTORY_RECORD_VERSION, kind: 'deleteFaces', faces: unique }
}

/**
 * The caption of a step, from its record.
 *
 * @param record The record of the step.
 *
 * @returns What the step does, like `Delete 3 face(s)`.
 */
export function labelOf(record: HistoryRecord): string {
  return `Delete ${String(record.faces.length)} face(s)`
}

/**
 * Builds the command of a record: the step a replay runs.
 *
 * @remarks
 * It takes the polygons **from the level it is given**, so the same record runs on the level of the session (where a
 * user pressed the key) and on the level loaded from the files (where a reload replays the steps) — provided the
 * level is in the state the record was made on, which a replay in order gives.
 *
 * A record of another version, or of a kind this build does not know, gives **no command**: the step is skipped
 * rather than guessed at.
 *
 * @param record The record to build the step of.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when the record can not be read by this build.
 */
export function commandOf(record: HistoryRecord, level: MutableLevel): HistoryCommand | undefined {
  if (record.version !== HISTORY_RECORD_VERSION) {
    return undefined
  }

  // a record written by a build that knows more kinds carries one this build does not: the kind is read as a plain
  // string, and that step is skipped rather than guessed at
  const { kind }: { readonly kind: string } = record

  if (kind !== 'deleteFaces') {
    return undefined
  }

  const insertions: PolygonInsertion[] = []

  for (const index of record.faces) {
    const polygon = level.polygons[index]

    if (polygon === undefined) {
      return undefined
    }

    insertions.push({ index, polygon })
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      level.removePolygons(
        insertions.map((insertion) => {
          return insertion.polygon
        }),
      )
    },
    revert: (): void => {
      level.insertPolygons(insertions)
    },
  }
}
