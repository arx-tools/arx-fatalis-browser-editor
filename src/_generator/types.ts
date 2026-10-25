/**
 * How the lighting calculator lights the level: the palette of the baked LLF.
 *
 * @remarks
 * - `Arx` is the game-like look (the palette the file came with), `Realistic` bakes it from the
 * light sources, `TextureRainbow` gives every polygon a hue of its texture, and the two extremes
 * are `MaxBrightness` and `CompleteDarkness`
 * - this is the generator's type: the editor holds a `DisplayLightingMode` (see `_editor/types.ts`),
 * which is the same set today
 */
export type LightingCalculatorMode = 'MaxBrightness' | 'CompleteDarkness' | 'Arx' | 'Realistic' | 'TextureRainbow'

/**
 * The values of {@link LightingCalculatorMode}, in the order the editor's select shows them.
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
