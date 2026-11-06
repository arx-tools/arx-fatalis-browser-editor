import type { FaceTexture } from '../../../generator/ArxMap.ts'
import type { PolygonInsertion } from '../../../generator/arxMap/removal.ts'
import type { HistoryCommand } from './history.ts'
import {
  HISTORY_RECORD_VERSION,
  labelOf,
  type HistoryRecord,
  type MutableLevel,
  type SetTextureRecord,
  type SetUvRecord,
} from './records.ts'

/**
 * What a step of the history does: the command of a record.
 *
 * @remarks
 * A record is the **shape** of a step, written so it can be stored and read back (see [`records.ts`](records.ts)); a
 * command is the same step against a live level — the functions here read the polygons of the level, and give `undefined`
 * when they are no longer there (a step of another level, or of a level that was edited under it). A record of another
 * version, or of a kind this build does not know, gives no command either: the step is skipped rather than guessed at.
 */

/**
 * Builds the command of a paint.
 *
 * @remarks
 * The two halves are the two states of the faces: the step puts the container of `to` on every face (adding the
 * container first, when the step added it), and the undo puts the container each face had before it back, and takes
 * the added container out of the level. The face indices are the ones of the level the record was made on, so a replay
 * in order finds the same faces.
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when a face of the record is not in the level.
 */
function textureCommandOf(record: SetTextureRecord, level: MutableLevel): HistoryCommand | undefined {
  const painted: FaceTexture[] = []
  const before: FaceTexture[] = []

  for (const [position, index] of record.faces.entries()) {
    if (level.polygons[index] === undefined) {
      return undefined
    }

    painted.push({ index, textureContainerId: record.to.id })
    before.push({ index, textureContainerId: record.from[position] ?? 0 })
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      if (record.added) {
        level.addTextureContainer(record.to.id, record.to.name)
      }

      level.setFaceTextures(painted)
    },
    revert: (): void => {
      level.setFaceTextures(before)

      if (record.added) {
        level.removeTextureContainer(record.to.id)
      }
    },
  }
}

/**
 * Builds the command of a uv edit.
 *
 * @remarks
 * The two halves are the two states of the corners: the step writes `to` and the undo writes `from`. The drag writes the
 * model before the step goes on the stack, so the apply of a step that just happened writes the same values again (a
 * redo after an undo writes the ones of the record).
 *
 * @param record The record of the step.
 * @param level The level the step changes.
 *
 * @returns The command, or undefined when the face is not in the level.
 */
function uvCommandOf(record: SetUvRecord, level: MutableLevel): HistoryCommand | undefined {
  for (const face of record.faces) {
    if (level.polygons[face] === undefined) {
      return undefined
    }
  }

  return {
    label: labelOf(record),
    record,
    apply: (): void => {
      for (const face of record.faces) {
        level.setFaceUvs(face, record.to)
      }
    },
    revert: (): void => {
      for (const face of record.faces) {
        level.setFaceUvs(face, record.from)
      }
    },
  }
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

  // a record written by a build that knows more kinds carries one this build does not: the check is on the value of the
  // kind, and that step is skipped rather than guessed at
  if (record.kind === 'setTexture') {
    return textureCommandOf(record, level)
  }

  if (record.kind === 'setUv') {
    return uvCommandOf(record, level)
  }

  if (record.kind !== 'deleteFaces') {
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
