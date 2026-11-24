import type { ArxColor, ArxPolygon, ArxVector3 } from 'arx-convert/types'
import {
  HISTORY_RECORD_VERSION,
  type DeleteFacesRecord,
  type PasteFacesRecord,
  type RotateFacesRecord,
  type ScaleFacesRecord,
  type TranslateFacesRecord,
} from './types.ts'

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
 * Builds the record of a paste, the way a step writes it down.
 *
 * @remarks
 * The polygons are copied: the record is the pasted state, and a later edit of the clipboard (or of the faces in the
 * level) must not move it.
 *
 * @param polygons The faces the clipboard holds.
 * @param colors The colors of the corners, when the clipboard has them.
 *
 * @returns The record of the step.
 */
export function createPasteFacesRecord(
  polygons: readonly ArxPolygon[],
  colors?: readonly ArxColor[],
): PasteFacesRecord {
  const record: PasteFacesRecord = {
    version: HISTORY_RECORD_VERSION,
    kind: 'pasteFaces',
    polygons: polygons.map((polygon) => {
      return structuredClone(polygon)
    }),
  }

  if (colors === undefined) {
    return record
  }

  return {
    ...record,
    colors: colors.map((color) => {
      return { ...color }
    }),
  }
}

/**
 * Builds the record of a move, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted and made unique, and the delta is copied: the same drag gives the same record whatever order
 * the selection held the faces in, and the record does not share the vector of the gesture.
 *
 * @param faces The faces the step moves.
 * @param delta The offset their corners take, in the coordinates of the level.
 *
 * @returns The record of the step.
 */
export function createTranslateFacesRecord(faces: Iterable<number>, delta: ArxVector3): TranslateFacesRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'translateFaces',
    faces: unique,
    delta: { x: delta.x, y: delta.y, z: delta.z },
  }
}

/**
 * Builds the record of a turn, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted and made unique, and the pivot and the axis are copied: the same drag gives the same record
 * whatever order the selection held the faces in, and the record does not share the vectors of the gesture.
 *
 * @param faces The faces the step turns.
 * @param pivot The point they turn around, in the coordinates of the level.
 * @param axis The axis of the turn, in the coordinates of the level.
 * @param angle The angle of the turn, in radians.
 *
 * @returns The record of the step.
 */
export function createRotateFacesRecord(
  faces: Iterable<number>,
  pivot: ArxVector3,
  axis: ArxVector3,
  angle: number,
): RotateFacesRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'rotateFaces',
    faces: unique,
    pivot: { x: pivot.x, y: pivot.y, z: pivot.z },
    axis: { x: axis.x, y: axis.y, z: axis.z },
    angle,
  }
}

/**
 * Builds the record of a scale, the way a step writes it down.
 *
 * @remarks
 * The faces are sorted and made unique, and the pivot and the factors are copied: the same drag gives the same record
 * whatever order the selection held the faces in, and the record does not share the vectors of the gesture.
 *
 * @param faces The faces the step scales.
 * @param pivot The point they scale around, in the coordinates of the level.
 * @param scale How far the corners move along the three axes, around 1.
 *
 * @returns The record of the step.
 */
export function createScaleFacesRecord(
  faces: Iterable<number>,
  pivot: ArxVector3,
  scale: ArxVector3,
): ScaleFacesRecord {
  const unique = [...new Set(faces)].toSorted((one, other) => {
    return one - other
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'scaleFaces',
    faces: unique,
    pivot: { x: pivot.x, y: pivot.y, z: pivot.z },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  }
}
