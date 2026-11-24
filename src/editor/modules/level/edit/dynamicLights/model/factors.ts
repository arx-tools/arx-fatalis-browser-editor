/**
 * The global factor of the light of the game (`GLOBAL_LIGHT_FACTOR` in `src/scene/Light.cpp`).
 */
export const GLOBAL_LIGHT_FACTOR = 0.85

/**
 * The factor the game gives the dynamic light of the background (`ApplyTileLights`).
 *
 * @remarks
 * The static palette was baked without it; the runtime layer adds this half of the light on top.
 */
export const DYNAMIC_LIGHT_FACTOR = 0.5
