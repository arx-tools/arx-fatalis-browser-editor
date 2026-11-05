import type { ArxPolygon } from 'arx-convert/types'
import type { FaceTexture } from '../../../generator/ArxMap.ts'
import type { PolygonInsertion } from '../../../generator/arxMap/removal.ts'
import type { FaceUv } from '../../../generator/arxMap/uvs.ts'
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
 * The step that takes faces out of the level.
 */
export interface DeleteFacesRecord {
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
 * The texture a face draws with after a step of {@link SetTextureRecord}.
 */
export interface TextureReference {
  /**
   * The id of the container in the level.
   */
  readonly id: number
  /**
   * The name of the texture, relative to `graph/obj3d/textures`.
   *
   * @remarks
   * The record carries it, so a replay can add the container with the name the step used: an id alone would say nothing
   * about what the face draws with, and the level a step is replayed on may not have it.
   */
  readonly name: string
}

/**
 * The step that paints faces with a texture.
 */
export interface SetTextureRecord {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setTexture'
  /**
   * The faces the step paints, by their index in the level, sorted.
   */
  readonly faces: readonly number[]
  /**
   * The container every face had before the step, in the order of {@link SetTextureRecord.faces}.
   */
  readonly from: readonly number[]
  /**
   * The container the faces take.
   */
  readonly to: TextureReference
  /**
   * Whether the step added the container of {@link SetTextureRecord.to} to the level.
   *
   * @remarks
   * The undo takes it out again, so a texture painted on a level that did not have it leaves nothing behind. A step
   * whose container the level already had does not touch the list.
   */
  readonly added: boolean
}

/**
 * The step that moves the corners of faces on their texture.
 *
 * @remarks
 * A selection of faces that **share** their texture and their uv is edited together (the uv mapper allows it), so the
 * step is a list of faces and one set of corners: the corners of every face are the ones of the record, before and
 * after. A step of one face is the same shape with one index.
 */
export interface SetUvRecord {
  /**
   * The version of the shape of this record, see {@link HISTORY_RECORD_VERSION}.
   */
  readonly version: number
  /**
   * What the step does, which names its payload.
   */
  readonly kind: 'setUv'
  /**
   * The faces, by their index in the level.
   */
  readonly faces: readonly number[]
  /**
   * The uv of the corners before the step, in the order of the polygon.
   */
  readonly from: readonly FaceUv[]
  /**
   * The uv of the corners after it.
   */
  readonly to: readonly FaceUv[]
}

/**
 * A step the way a JSON can hold it.
 *
 * @remarks
 * The command of the editor is a pair of closures (`apply`/`revert`), and a closure can not be written to a file. A
 * record is the **description** of the same step: the plain data it needs, without the code. Every command carries
 * one (see {@link HistoryCommand.record}), so what can be undone is exactly what can be stored — the two can not
 * drift apart.
 *
 * The union grows with the kinds of the steps: `deleteFaces` and `setTexture` today, `moveVertex`, `moveLight` and the
 * rest as they arrive.
 */
export type HistoryRecord = DeleteFacesRecord | SetTextureRecord | SetUvRecord

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
  /**
   * Sets the texture container of faces.
   *
   * @param changes The faces and the container each of them takes.
   */
  setFaceTextures(changes: readonly FaceTexture[]): void
  /**
   * Adds a texture container to the level.
   *
   * @param id The id the container takes.
   * @param filename The name of the texture.
   */
  addTextureContainer(id: number, filename: string): void
  /**
   * Takes a texture container out of the level.
   *
   * @param id The id of the container.
   */
  removeTextureContainer(id: number): void
  /**
   * Sets the uv of the corners of a face.
   *
   * @param faceIndex The face in the level.
   * @param uvs The uv of the corners, in the order they are stored.
   */
  setFaceUvs(faceIndex: number, uvs: readonly FaceUv[]): void
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
export function createDeleteFacesRecord(faces: Iterable<number>): DeleteFacesRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return { version: HISTORY_RECORD_VERSION, kind: 'deleteFaces', faces: unique }
}

/**
 * The face and the container it has before a paint, the way a step writes it down.
 */
export interface FaceTextureChange {
  /**
   * The index of the face in the level.
   */
  readonly index: number
  /**
   * The id of the container the face draws with now.
   */
  readonly from: number
}

/**
 * Builds the record of a paint, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted by their index, and the old containers follow them, so the same paint gives the same record
 * whatever order the selection held the faces in.
 *
 * @param changes The faces the step paints and their containers before the step.
 * @param to The container the faces take, with the name of its texture.
 * @param added Whether the step adds the container of `to` to the level.
 *
 * @returns The record of the step.
 */
export function createSetTextureRecord(
  changes: Iterable<FaceTextureChange>,
  to: TextureReference,
  added: boolean,
): SetTextureRecord {
  const sorted = [...changes].toSorted((one, other) => {
    return one.index - other.index
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'setTexture',
    faces: sorted.map((change) => {
      return change.index
    }),
    from: sorted.map((change) => {
      return change.from
    }),
    to,
    added,
  }
}

/**
 * Builds the record of a uv edit, the way a step writes it down.
 *
 * @remarks
 * The corners of the faces move together, so the record is the faces and the two states of their (shared) corners: the
 * drag writes the model while it runs (the view follows it), and the step goes on the stack when the pointer is let go —
 * with the uv of the moment the drag began as the state the undo goes back to.
 *
 * @param faces The faces in the level, by their index.
 * @param from The uv of their corners before the step.
 * @param to The uv of their corners after it.
 *
 * @returns The record of the step.
 */
export function createSetUvRecord(
  faces: Iterable<number>,
  from: readonly FaceUv[],
  to: readonly FaceUv[],
): SetUvRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'setUv',
    faces: unique,
    from: from.map((uv) => {
      return { u: uv.u, v: uv.v }
    }),
    to: to.map((uv) => {
      return { u: uv.u, v: uv.v }
    }),
  }
}

/**
 * The caption of a step, from its record.
 *
 * @param record The record of the step.
 *
 * @returns What the step does, like `Delete 3 face(s)` or `Set texture on 4 face(s)`.
 */
export function labelOf(record: HistoryRecord): string {
  if (record.kind === 'setTexture') {
    return `Set texture on ${String(record.faces.length)} face(s)`
  }

  if (record.kind === 'setUv') {
    if (record.faces.length === 1) {
      return `Move the uv of face ${String(record.faces[0])}`
    }

    return `Move the uv of ${String(record.faces.length)} face(s)`
  }

  return `Delete ${String(record.faces.length)} face(s)`
}

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
