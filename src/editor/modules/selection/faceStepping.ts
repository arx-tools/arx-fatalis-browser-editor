import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { cameraStore } from '../../components/widgets/camera/cameraStore.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { faceFrameOf } from './faceFrame.ts'
import { selectionStore } from './selectionStore.ts'

/**
 * Which way a step walks the selected faces.
 */
export type FaceStep = 'next' | 'previous'

/**
 * The face a step lands on.
 *
 * @remarks
 * The faces come in the order of the level, and a step walks that order and **wraps**: the next step of the last face
 * is the first one, so a selection of four faces is a ring of four and the author can look at each of them in turn
 * (2026-11-22, the four faces without a room of the owner's level 1). The step of a face that left the selection
 * starts the ring over, so a new gesture is never continued from a face that is not in it any more.
 *
 * @param faces The faces of the selection, in the order of the level.
 * @param current The face of the last step, when one ran.
 * @param step The direction to walk.
 *
 * @returns The face of this step, or `undefined` when nothing is selected.
 */
export function steppedFaceOf(
  faces: readonly number[],
  current: number | undefined,
  step: FaceStep,
): number | undefined {
  if (faces.length === 0) {
    return undefined
  }

  let first = faces[0]
  let at = -1

  if (step === 'previous') {
    first = faces.at(-1) ?? faces[0]
  }

  if (current !== undefined) {
    at = faces.indexOf(current)
  }

  if (at < 0) {
    return first
  }

  let offset = -1

  if (step === 'next') {
    offset = 1
  }

  return faces[(at + offset + faces.length) % faces.length]
}

/**
 * The face the last step stopped on.
 */
let steppedFace: number | undefined

/**
 * Steps the camera to the next or the previous face of the selection.
 *
 * @remarks
 * The step is a skip through the selection: the camera goes to the face and looks at it, and the selection stays as it
 * is, so the author sees the face the selection already holds. The faces no view shows (a face inside a wall, or a face
 * of a place the camera never went to) are the ones this is for.
 *
 * @param step The direction to walk.
 */
export function stepSelectedFace(step: FaceStep): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const faces = [...selectionStore.polygons.value].toSorted((left, right) => {
    return left - right
  })
  const face = steppedFaceOf(faces, steppedFace, step)

  if (face === undefined) {
    return
  }

  const polygon = map.polygons[face]

  if (polygon === undefined) {
    return
  }

  const frame = faceFrameOf(polygon)

  if (frame === undefined) {
    return
  }

  steppedFace = face
  cameraStore.moveCamera(frame.pose)
}

/**
 * Binds the two steps of the selection to their keys.
 */
export function startFaceStepping(): void {
  onKeyboardAction('stepNextFace', () => {
    stepSelectedFace('next')
  })
  onKeyboardAction('stepPreviousFace', () => {
    stepSelectedFace('previous')
  })
}
