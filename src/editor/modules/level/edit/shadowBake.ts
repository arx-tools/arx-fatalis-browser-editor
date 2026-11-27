/**
 * How long a bake waits for the steps of a gesture, in milliseconds.
 *
 * @remarks
 * A step of the history is one per gesture (a drag writes the model while it runs and commits once), but an undo of a
 * few steps, a paste and an import may land together: the bake reads the whole level, so it waits for the last one.
 */
const SHADOW_BAKE_DELAY_MS = 250

/**
 * The bake the lighting module registered, when the editor started it.
 */
let bake: (() => void) | undefined

/**
 * The timer of the bake that waits for the last step.
 */
let scheduled: ReturnType<typeof setTimeout> | undefined

/**
 * Registers what a step that changes the occluders of the light asks for.
 *
 * @remarks
 * The bake lives in `lighting.ts`, which reads the paint of the textures, and that one reads this module's `editing.ts`:
 * a direct import would close the circle. The lighting module hands its bake over here instead, and the steps of the
 * level call {@link requestShadowBake} (2026-11-27: a face added, moved or deleted changes where the light of the level
 * falls).
 *
 * @param run The bake, when the profile of the editor casts shadows.
 */
export function registerShadowBake(run: () => void): void {
  bake = run
}

/**
 * Asks for a bake of the palette, because the steps changed what the light falls on.
 *
 * @remarks
 * The call is cheap when the profile casts no shadows: the registered bake decides. The bake waits
 * {@link SHADOW_BAKE_DELAY_MS} for the last step of a burst.
 */
export function requestShadowBake(): void {
  if (bake === undefined) {
    return
  }

  if (scheduled !== undefined) {
    clearTimeout(scheduled)
  }

  scheduled = setTimeout(() => {
    scheduled = undefined
    bake?.()
  }, SHADOW_BAKE_DELAY_MS)
}
