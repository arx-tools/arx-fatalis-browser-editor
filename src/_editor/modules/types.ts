import type { LightingCalculatorMode } from '../../_generator/types.ts'

/**
 * How the editor's materials show the level.
 *
 * @remarks
 * - `dynamic` is the game-like look: the baked palette (or the texture albedo) is the base and the
 * lights around the camera are added on top as point lights
 * - `maxBrightness` and `completeDarkness` are unlit white and black materials, `rainbow` gives
 * every polygon a hue of its texture
 * - the value is derived from the generator's {@link LightingCalculatorMode}: the editor does not
 * store it, so it does not belong to the persisted state
 */
export type DisplayLightingMode = 'completeDarkness' | 'dynamic' | 'maxBrightness' | 'rainbow'

/**
 * Maps the lighting calculator mode of the generator to the way the editor displays the level.
 *
 * @param mode The mode the generator would use.
 * @returns The display mode of the materials.
 */
export function toDisplayLightingMode(mode: LightingCalculatorMode): DisplayLightingMode {
  switch (mode) {
    case 'MaxBrightness': {
      return 'maxBrightness'
    }

    case 'CompleteDarkness': {
      return 'completeDarkness'
    }

    case 'TextureRainbow': {
      return 'rainbow'
    }

    case 'Arx':
    case 'Realistic': {
      return 'dynamic'
    }
  }
}
