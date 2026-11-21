import { shallowRef } from 'vue'
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
 * Whether Shift is held, as the last key event of the window said.
 *
 * @remarks
 * It is a ref of the **editor**, not of a widget: the magnet of the 3D view and the rotate gizmo both read it, and the
 * view has to light the magnet up on the key itself, before the pointer moves (the key event is the whole gesture on
 * those two switches). The listeners live in {@link startSnapModifier}.
 */
export const snapModifierHeld = shallowRef(false)

/**
 * Whether the listeners of Shift are on.
 */
let snapModifierStarted = false

/**
 * Starts following the Shift key.
 *
 * @remarks
 * A key event is the only source: `keydown` and `keyup` both carry `shiftKey`, so a Shift pressed while the pointer
 * stands still still moves the state, and `blur` lets the key go when the window loses the focus (a release outside the
 * page would leave the coarse step on). The listeners stay for the life of the page, and a second call is a no-op.
 */
export function startSnapModifier(): void {
  if (snapModifierStarted) {
    return
  }

  snapModifierStarted = true

  /**
   * Writes the Shift of a key event.
   *
   * @param event The key event of the window.
   */
  function update(event: KeyboardEvent): void {
    snapModifierHeld.value = event.shiftKey
  }

  /**
   * Lets the key go when the window loses the focus.
   */
  function reset(): void {
    snapModifierHeld.value = false
  }

  globalThis.addEventListener('keydown', update)
  globalThis.addEventListener('keyup', update)
  window.addEventListener('blur', reset)
}

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

/**
 * The distance, in the pixels of the canvas, a corner has to come to a vertex to snap to it.
 *
 * @remarks
 * A screen-space distance is the same gesture at every zoom: the author aims at a corner of the view, not at a number of
 * world units that grow with the distance of the camera.
 */
export const SNAP_THRESHOLD_PX = 12

/**
 * Whether the translate gizmo snaps the selection to the vertices of the level.
 *
 * @remarks
 * The magnet of the 3D view is this switch, and it starts **off**: the snap is a help, not the rule. Holding Shift
 * turns it on for the length of a drag, the same way it takes the rotate gizmo to its coarse step.
 */
export const vertexSnapEnabled = persistedRef<boolean>({
  key: 'vertexSnapEnabled',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * One axis of the game the gizmo of a drag moves along.
 */
export type SnapAxis = 'x' | 'y' | 'z'

/**
 * The axes a drag may snap on, from the handle of the gizmo.
 *
 * @remarks
 * The handle says which arrows are under the pointer: one for an axis, two for a plane. The snap corrects only those
 * coordinates, so a drag along the game's Z keeps the X and Y the author chose, and a plane brings both of its axes.
 *
 * @param axis The handle of the gizmo, like `X` or `XZ`.
 *
 * @returns The axes, or none when the handle is not one of the arrows (the screen-space ring).
 */
export function snapAxesOf(axis: string | null | undefined): readonly SnapAxis[] {
  if (axis === null || axis === undefined) {
    return []
  }

  const handles: Readonly<Record<string, readonly SnapAxis[]>> = {
    X: ['x'],
    Y: ['y'],
    Z: ['z'],
    XY: ['x', 'y'],
    YZ: ['y', 'z'],
    XZ: ['x', 'z'],
  }

  return handles[axis.toUpperCase()] ?? []
}

/**
 * A corner or a vertex, as the canvas shows it.
 */
export type ScreenPoint = {
  readonly x: number
  readonly y: number
}

/**
 * The closest pair of a corner and a vertex, within the threshold.
 */
export type SnapPair = {
  /**
   * The index of the corner in the list it came from.
   */
  readonly corner: number
  /**
   * The index of the vertex in the list it came from.
   */
  readonly target: number
  /**
   * How far the two are on the canvas, in pixels.
   */
  readonly distance: number
}

/**
 * How far a corner and a vertex are, for the snap of a drag.
 *
 * @remarks
 * A drag along one axis is measured **across** that axis: the corner and the vertex may be far apart along the axis
 * (that is the movement the author is doing), and the snap has to catch them when the other coordinates line up. A plane
 * drag has no single direction to ignore, so it uses the plain distance of the canvas.
 */
export type SnapDistance = (corner: ScreenPoint, target: ScreenPoint, cornerIndex: number) => number

/**
 * How far two points of the canvas are.
 *
 * @param from One point.
 * @param to The other.
 *
 * @returns The distance in pixels.
 */
export function screenDistance(from: ScreenPoint, to: ScreenPoint): number {
  return Math.hypot(from.x - to.x, from.y - to.y)
}

/**
 * How far a point is from the line of a drag axis on the canvas.
 *
 * @remarks
 * A point on the axis has no distance, however far it is along the line: that is the movement the author is doing, and
 * a drag along the game's Y has to snap a vertex **below** the face as well as one beside it. The measure is the
 * perpendicular of the line through the corner and the drag axis, so only the coordinates the snap corrects count.
 *
 * @param point The point to measure, the vertex.
 * @param origin A point of the line, the corner.
 * @param direction The direction of the line, as the canvas shows it.
 *
 * @returns The distance in pixels; the plain distance when the direction is a point.
 */
export function perpendicularDistance(point: ScreenPoint, origin: ScreenPoint, direction: ScreenPoint): number {
  const length = Math.hypot(direction.x, direction.y)

  if (length === 0) {
    return screenDistance(point, origin)
  }

  const along = (point.x - origin.x) * direction.y
  const across = (point.y - origin.y) * direction.x

  return Math.abs(along - across) / length
}

/**
 * Reads the closest vertex of every corner of a frame.
 *
 * @remarks
 * Every corner gets its own nearest vertex: a face has four of them, and three of those may stand over a vertex at the
 * same time. The pairs are what the marker of the snap shows, and the closest of them is the one the translation
 * follows.
 *
 * @param corners The corners of the selection, as the canvas shows them.
 * @param targets The vertices of the level, as the canvas shows them.
 * @param threshold The farthest a pair may be, in pixels.
 * @param distanceOf The measure of a pair, the plain distance by default.
 *
 * @returns The nearest vertex of each corner, within the threshold.
 */
export function nearestSnapPairs(
  corners: readonly ScreenPoint[],
  targets: readonly ScreenPoint[],
  threshold = SNAP_THRESHOLD_PX,
  distanceOf: SnapDistance = screenDistance,
): SnapPair[] {
  const pairs: SnapPair[] = []

  for (const [cornerIndex, from] of corners.entries()) {
    let best: SnapPair | undefined

    for (const [target, to] of targets.entries()) {
      const distance = distanceOf(from, to, cornerIndex)

      if (!Number.isFinite(distance) || distance > threshold) {
        continue
      }

      if (best === undefined || distance < best.distance) {
        best = { corner: cornerIndex, target, distance }
      }
    }

    if (best !== undefined) {
      pairs.push(best)
    }
  }

  return pairs
}

/**
 * Reads the closest corner-to-vertex pair of a frame.
 *
 * @param corners The corners of the selection, as the canvas shows them.
 * @param targets The vertices of the level, as the canvas shows them.
 * @param threshold The farthest a pair may be, in pixels.
 *
 * @returns The closest pair within the threshold, or `undefined` when there is none.
 */
export function nearestSnapPair(
  corners: readonly ScreenPoint[],
  targets: readonly ScreenPoint[],
  threshold = SNAP_THRESHOLD_PX,
): SnapPair | undefined {
  return nearestSnapPairs(corners, targets, threshold).toSorted((one, other) => {
    return one.distance - other.distance
  })[0]
}
