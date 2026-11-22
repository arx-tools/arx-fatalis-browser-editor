import type { ArxMap } from '../../../../generator/ArxMap.ts'
import type { LightingOptions } from '../../../../generator/lighting.ts'
import type { LightingCalculatorMode } from '../../../../generator/types.ts'
import { parseJson } from '../../persistedRef/functions.ts'
import { persistedRef } from '../../persistedRef/persistedRef.ts'

/**
 * The profiles the lighting widget offers.
 *
 * @remarks
 * Both profiles bake the static lights, which is what the game's own palette holds: the `Arx` one is the look of the
 * game (a factor of 0.85 and the ambient floor of the palette), the `Realistic` one the true factor of 1, with its own
 * ambient floor and shadows. The torches are semidynamic lights, and the game lights them up at runtime, so neither
 * profile puts them into the palette (2026-11-16, the owner's decision). `TextureRainbow` is a check of the textures,
 * not a look for a level.
 *
 * The `Flat` profile is one grey on every corner, set by a slider of its own (0 is dark, 1 is the brightest, in steps
 * of 0.1): it covers the old max brightness and darkness in one control, and its light is the same whatever the lamps
 * of the level do.
 */
export type LightingProfile = Extract<LightingCalculatorMode, 'Arx' | 'Realistic' | 'TextureRainbow' | 'Flat'>

/**
 * The profiles of the widget, in the order the select shows them.
 */
export const LIGHTING_PROFILES: ReadonlyArray<{ readonly value: LightingProfile; readonly label: string }> =
  Object.freeze([
    Object.freeze({ value: 'Arx', label: 'Arx' }),
    Object.freeze({ value: 'Flat', label: 'Flat' }),
    Object.freeze({ value: 'Realistic', label: 'Realistic' }),
    Object.freeze({ value: 'TextureRainbow', label: 'Texture Rainbow' }),
  ])

/**
 * The profile a level starts with.
 */
export const DEFAULT_LIGHTING_PROFILE: LightingProfile = 'Flat'

/**
 * Tells whether a value is a profile the widget knows.
 *
 * @param value The value of the storage or of the url.
 *
 * @returns True when it is one of the profiles.
 */
export function isLightingProfile(value: unknown): value is LightingProfile {
  return LIGHTING_PROFILES.some((profile) => {
    return profile.value === value
  })
}

/**
 * The profile of the lighting, in the local storage.
 *
 * @remarks
 * The profile is a fact of the author, not of the level (the same as the name of the export): it stays in the browser
 * between the maps. A stored value this build does not know falls back to the default one. The `Flat` one draws one
 * grey on every corner, and its slider sets how bright that grey is.
 */
export const lightingProfile = persistedRef<LightingProfile>({
  key: 'lightingProfile',
  defaultValue: DEFAULT_LIGHTING_PROFILE,
  persistInLocalStorage: true,
  deserialize: (raw: string): LightingProfile | undefined => {
    const value = parseJson(raw)

    if (isLightingProfile(value)) {
      return value
    }

    return undefined
  },
})

/**
 * The light of the `Flat` profile, from 0 (dark) to 1 (the brightest).
 *
 * @remarks
 * The widget's slider moves it in steps of 0.1, and the bake of the flat profile reads it. It is a fact of the author,
 * like the profile: it stays in the browser.
 */
export const flatLuminosity = persistedRef<number>({
  key: 'flatLuminosity',
  defaultValue: 0.7,
  persistInLocalStorage: true,
  deserialize: (raw: string): number | undefined => {
    const value = parseJson(raw)

    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value))
    }

    return undefined
  },
})

/**
 * The value of the colours of the `TextureRainbow` profile, from 0 (black) to 1 (the full colour of the hue).
 *
 * @remarks
 * The profile has a light of its own, like the `Flat` one: the slider of the widget sets the value of every hue, and
 * the bake reads it, so a darker level keeps the colours of the containers, just darker. It is a fact of the author,
 * like the profile: it stays in the browser, and its default is the 70% of the flat one (2026-11-22, the owner).
 */
export const rainbowLuminosity = persistedRef<number>({
  key: 'rainbowLuminosity',
  defaultValue: 0.7,
  persistInLocalStorage: true,
  deserialize: (raw: string): number | undefined => {
    const value = parseJson(raw)

    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value))
    }

    return undefined
  },
})

/**
 * Whether a profile has a light of its own, with a luminosity slider.
 *
 * @remarks
 * The `Flat` one draws one grey and the `Texture Rainbow` one a hue per texture: neither reads the lights of the level,
 * so the slider of the widget is the light of the map for both (2026-11-22, the owner: the rainbow got one too).
 *
 * @param profile The profile of the widget.
 *
 * @returns True for the two profiles that carry their own light.
 */
export function hasLuminosity(profile: LightingProfile): boolean {
  return profile === 'Flat' || profile === 'TextureRainbow'
}

/**
 * Whether a profile is the `Texture Rainbow` one.
 *
 * @remarks
 * The profile keeps the textures of the level, but lightened: its palette is the colour of the containers, and the
 * texture may not drown it (`paint.ts` `RAINBOW_TEXTURE_STRENGTH`). The other profiles draw the textures as the game
 * has them.
 *
 * @param profile The profile of the widget.
 *
 * @returns True for the `TextureRainbow` profile.
 */
export function isRainbowProfile(profile: LightingProfile): boolean {
  return profile === 'TextureRainbow'
}

/**
 * Whether a profile of the bake draws the palette of the level, or a colour of its own.
 *
 * @remarks
 * The `Arx` and the `Realistic` profiles bake the palette from the lights; the `Flat` one draws one grey, and the
 * `TextureRainbow` one a hue per texture, so a light edit does not change what those two show.
 *
 * @param mode The mode of the bake.
 *
 * @returns True when the palette of the level is the light the bake writes.
 */
export function readsPalette(mode: LightingCalculatorMode): boolean {
  return mode === 'Arx' || mode === 'Realistic'
}

/**
 * The light of the flat profile of the map, or `undefined` for the palette.
 *
 * @param profile Which profile bakes the map now.
 * @param luminosity The slider of the widget, 0 to 1.
 *
 * @returns The grey it draws with, or `undefined` when the palette does.
 */
export function flatLightOfProfile(profile: LightingProfile, luminosity: number): number | undefined {
  if (profile === 'Flat') {
    return luminosity
  }

  return undefined
}

/**
 * The key of a palette in the cache: the profile, and the luminosity of a profile that has one.
 *
 * @param profile Which profile bakes the map now.
 * @param flatLight The slider of the flat profile, 0 to 1.
 * @param rainbowLight The slider of the rainbow profile, 0 to 1.
 *
 * @returns The key the cache stores the palette under.
 */
export function paletteKeyOf(profile: LightingProfile, flatLight: number, rainbowLight: number): string {
  if (profile === 'Flat') {
    return `Flat:${flatLight.toFixed(1)}`
  }

  if (profile === 'TextureRainbow') {
    return `TextureRainbow:${rainbowLight.toFixed(1)}`
  }

  return profile
}

/**
 * The options a bake of the palette of a level reads, from the profile of the widget.
 *
 * @remarks
 * The profiles that read the lights run without the shadow rays: the bake with them costs about five seconds on a big
 * level, and the widget has no switch for it. The ambient floor of the game-like profile is the 23 of its own palette
 * (`lighting.ts` overrides it for `Arx` anyway).
 *
 * @param map The level to bake.
 *
 * @returns The profile of the widget, as the options of a bake.
 */
export function paletteBakeOptionsOf(map: ArxMap): LightingOptions {
  return {
    mode: lightingProfile.value,
    flatLuminosity: flatLuminosity.value,
    rainbowLuminosity: rainbowLuminosity.value,
    occluders: map.solidMeshes,
    ambientFloor: 23,
    shadows: false,
  }
}
