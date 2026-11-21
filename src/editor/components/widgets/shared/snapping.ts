import { parseJson } from '../../../modules/persistedRef/functions.ts'
import { persistedRef } from '../../../modules/persistedRef/persistedRef.ts'

/**
 * The turn the rotate gizmo snaps to when the author does not hold Shift, in degrees.
 *
 * @remarks
 * The rings of the gizmo follow the walls of a level, and 15 degrees gives the quarters, the halves and the eighths in
 * one drag. It is a **preference of the editor**, not a value of the level: a persisted ref, so a later control (the
 * magnet of the snapping round) can change it while the editor runs.
 */
export const DEFAULT_ROTATION_SNAP_DEGREES = 15

/**
 * The turn the rotate gizmo snaps to while Shift is held, in degrees.
 *
 * @remarks
 * The coarse step of a drag: the same four quarters, but a quarter in one move (45, 90, 135…). It is the same on every
 * base value, so a 10 degree setting still gives 45 with Shift.
 */
export const COARSE_ROTATION_SNAP_DEGREES = 45

/**
 * The step the rotate gizmo snaps to, in degrees.
 *
 * @remarks
 * The setting the magnet of the snapping round will write: 15 by default, and any whole degree from 1 to 180 is a step
 * the gizmo can hold. A stored value this build can not use falls back to the default.
 */
export const rotationSnapDegrees = persistedRef<number>({
  key: 'rotationSnapDegrees',
  defaultValue: DEFAULT_ROTATION_SNAP_DEGREES,
  persistInLocalStorage: true,
  deserialize: (raw: string): number | undefined => {
    const value = parseJson(raw)

    if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 180) {
      return value
    }

    return undefined
  },
})

/**
 * The step the rotate gizmo uses now, with the Shift key taken into account.
 *
 * @param shiftHeld Whether the author holds Shift.
 *
 * @returns The step in degrees: the coarse one while Shift is held, the setting otherwise.
 */
export function rotationSnapFor(shiftHeld: boolean): number {
  if (shiftHeld) {
    return COARSE_ROTATION_SNAP_DEGREES
  }

  return rotationSnapDegrees.value
}
