import { roundToNDecimals } from '../../../modules/functions.ts'
import type { CameraPose } from '../cameraPose.ts'

/**
 * The name of one field of the camera form.
 *
 * @remarks
 * The order of {@link cameraFieldNames} is the order of the fields on the screen: the position comes
 * first, then the rotation.
 */
export type CameraFieldName = 'pitch' | 'roll' | 'x' | 'y' | 'z' | 'yaw'

/**
 * The text of the camera form: one string per field.
 *
 * @remarks
 * The form keeps the text and not the numbers, because an input holds an invalid value too (a half
 * typed `-12.`), and the field has to show it so it can be corrected instead of silently snapping back.
 */
export type CameraFields = Record<CameraFieldName, string>

/**
 * The field names in the order the form shows them.
 */
export const cameraFieldNames: readonly CameraFieldName[] = ['x', 'y', 'z', 'pitch', 'yaw', 'roll']

/**
 * How much one step of a field changes the value.
 *
 * @remarks
 * It is the `step` of the inputs as well, so the arrow keys and the spinner of the form walk the same
 * distance.
 */
export const stepSize = 10

/**
 * What the form shows when there is no camera to show.
 *
 * @returns The fields with an empty text in every one.
 */
export function emptyFields(): CameraFields {
  return { x: '', y: '', z: '', pitch: '', yaw: '', roll: '' }
}

/**
 * Reads a number out of the text of a field.
 *
 * @param source The raw input of one field, spaces and a sign included.
 *
 * @returns The number it holds, or `undefined` when it is not a finite number.
 */
export function parseField(source: string): number | undefined {
  const trimmed = source.trim()

  if (trimmed === '') {
    return undefined
  }

  const parsed = Number.parseFloat(trimmed)

  if (Number.isFinite(parsed)) {
    return parsed
  }

  return undefined
}

/**
 * Reads the six fields as a pose.
 *
 * @remarks
 * - every field has to hold a finite number, the roll included: a form that is half filled in does not
 * move the camera (it keeps the last pose it had)
 * - the roll is read to find a broken form, but the editor's camera has no roll, so the pose does not
 * carry it
 *
 * @param fields The text of the form.
 *
 * @returns The pose, or `undefined` when any field is invalid.
 */
export function parsePose(fields: CameraFields): CameraPose | undefined {
  const parsed = {
    x: parseField(fields.x),
    y: parseField(fields.y),
    z: parseField(fields.z),
    pitch: parseField(fields.pitch),
    yaw: parseField(fields.yaw),
    roll: parseField(fields.roll),
  }

  if (
    parsed.x === undefined ||
    parsed.y === undefined ||
    parsed.z === undefined ||
    parsed.pitch === undefined ||
    parsed.yaw === undefined ||
    parsed.roll === undefined
  ) {
    return undefined
  }

  return { position: { x: parsed.x, y: parsed.y, z: parsed.z }, angle: { pitch: parsed.pitch, yaw: parsed.yaw } }
}

/**
 * Steps one field with the arrow keys.
 *
 * @remarks
 * The value is **rounded to a whole number first**, and only then stepped: a camera that stands on
 * `3533.64` steps to `3544` and not to `3543.64`, so the numbers of the form stay readable. A field that
 * does not hold a number starts from the pose the camera really has (`fallback`), so the first press
 * repairs a broken field instead of doing nothing.
 *
 * @param source The text of the field.
 * @param direction `1` steps up, `-1` steps down.
 * @param fallback The text of the value the camera currently holds in that field.
 *
 * @returns The text of the stepped field.
 */
export function stepField(source: string, direction: 1 | -1, fallback: string): string {
  const current = parseField(source) ?? parseField(fallback) ?? 0
  const step = direction * stepSize

  return (Math.round(current) + step).toString()
}

/**
 * Tells which fields of the form are invalid.
 *
 * @remarks
 * An empty field counts as invalid: the camera form shows a pose, and a missing number is not one. The
 * caller may show the border only on an editable field (an empty form in front of a missing camera is
 * not the user's mistake).
 *
 * @param fields The text of the form.
 *
 * @returns The fields that do not hold a finite number.
 */
export function invalidFields(fields: CameraFields): Record<CameraFieldName, boolean> {
  const result: Record<CameraFieldName, boolean> = {
    x: false,
    y: false,
    z: false,
    pitch: false,
    yaw: false,
    roll: false,
  }

  for (const name of cameraFieldNames) {
    result[name] = parseField(fields[name]) === undefined
  }

  return result
}

/**
 * Writes a pose into the text of the form.
 *
 * @remarks
 * Two decimals is the resolution the url carries as well, and the rounding comes from the same helper
 * (`roundToNDecimals`), so the form, the url and the readout show the same number. The editor's camera
 * has no roll, so that field holds a zero.
 *
 * @param pose The pose to show.
 *
 * @returns The text of the form.
 */
export function formatPose(pose: CameraPose): CameraFields {
  return {
    x: roundToNDecimals(pose.position.x, 2).toFixed(2),
    y: roundToNDecimals(pose.position.y, 2).toFixed(2),
    z: roundToNDecimals(pose.position.z, 2).toFixed(2),
    pitch: roundToNDecimals(pose.angle.pitch, 2).toFixed(2),
    yaw: roundToNDecimals(pose.angle.yaw, 2).toFixed(2),
    roll: (0).toFixed(2),
  }
}

/**
 * Follows the pose without taking the field the user is typing into.
 *
 * @remarks
 * The camera moves on every mouse move, so a form bound straight to the pose would lose a half typed
 * number. The field with the focus keeps its text until the user leaves it (see the blur of the form,
 * which snaps it to the pose the camera really holds).
 *
 * @param current The text the form shows now.
 * @param next The text of the new pose.
 * @param focused The field that has the focus, if any.
 *
 * @returns The text the form should show.
 */
export function syncFields(
  current: CameraFields,
  next: CameraFields,
  focused: CameraFieldName | undefined,
): CameraFields {
  if (focused === undefined) {
    return { ...next }
  }

  return { ...next, [focused]: current[focused] }
}
