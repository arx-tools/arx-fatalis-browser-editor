/**
 * How the lighting calculator lights the level: the palette of the baked LLF.
 *
 * @remarks
 * - `Arx` is the game-like look (the palette the file came with), `Realistic` bakes it from the
 * light sources, `TextureRainbow` gives every polygon a hue of its texture, and the two extremes
 * are `MaxBrightness` and `CompleteDarkness`
 * - this is the level generator's type: a consumer which shows the result may keep its own display
 * type and map this to it
 */
export type LightingCalculatorMode = 'MaxBrightness' | 'CompleteDarkness' | 'Arx' | 'Realistic' | 'TextureRainbow'

/**
 * The values of {@link LightingCalculatorMode}, in the order a select should show them.
 */
export const lightingCalculatorModes: readonly LightingCalculatorMode[] = [
  'Arx',
  'Realistic',
  'TextureRainbow',
  'MaxBrightness',
  'CompleteDarkness',
]

/**
 * Tells whether a string is one of the lighting calculator modes.
 *
 * @param value The string to check, for example one which came from the url.
 * @returns True when the value is a known mode.
 */
export function isLightingCalculatorMode(value: string): value is LightingCalculatorMode {
  return (lightingCalculatorModes as readonly string[]).includes(value)
}
