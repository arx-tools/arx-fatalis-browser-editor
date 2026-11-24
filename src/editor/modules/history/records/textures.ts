import type { FaceUv } from '../../../../generator/arxMap/uvs.ts'
import {
  HISTORY_RECORD_VERSION,
  type FaceTextureChange,
  type SetTextureRecord,
  type SetUvRecord,
  type TextureReference,
} from './types.ts'

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
