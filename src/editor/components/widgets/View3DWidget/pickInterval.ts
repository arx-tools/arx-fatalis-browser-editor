/**
 * The interval of the crosshair pick of the walkable view, in milliseconds.
 *
 * @remarks
 * The pick is a raycast through the level, and a long ray (the spawn looking across a big level) costs **11,6 ms** on
 * level 11 (measured: `experiments/browser-editor-texture-groups/`). While the camera moves that is a frame of its own,
 * and the outline and the inspector only have to follow the face under the crosshair: the pick runs at most this often,
 * and once more when the camera stops (the view asks for that frame).
 */
export const PICK_INTERVAL_MS = 50

/**
 * Tells whether the crosshair pick is due.
 *
 * @param now The timestamp of the frame, in milliseconds (the one the browser gave to the animation frame).
 * @param lastPickAt The timestamp of the last pick, `0` when there was none.
 * @param intervalMs How long two picks are at least apart.
 *
 * @returns Whether the pick may run now.
 */
export function isPickDue(now: number, lastPickAt: number, intervalMs: number = PICK_INTERVAL_MS): boolean {
  return now - lastPickAt >= intervalMs
}
