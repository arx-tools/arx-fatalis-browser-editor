import { shallowRef, watch, type ShallowRef } from 'vue'
import { bakeLlfColorsInChunks } from '../../../../generator/lighting.ts'
import type { LightingCalculatorMode } from '../../../../generator/types.ts'
import { parseJson } from '../../persistedRef/functions.ts'
import { persistedRef } from '../../persistedRef/persistedRef.ts'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { bumpLevelRevision } from './editing.ts'
import { writeBakedColors } from './levelTextures/bakedColors.ts'
import { paintLevel, repaintLevelTextures } from './levelTextures.ts'
import { levelStore } from './levelStore.ts'

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
 * The flat light is not here yet: it will come as a `Flat` profile with a slider of its own (0 is dark, 1 is the
 * brightest, in steps of 0.1), which covers the old max brightness and darkness in one control.
 */
export type LightingProfile = Extract<LightingCalculatorMode, 'Arx' | 'Realistic' | 'TextureRainbow'>

/**
 * The profiles of the widget, in the order the select shows them.
 */
export const LIGHTING_PROFILES: ReadonlyArray<{ readonly value: LightingProfile; readonly label: string }> = [
  { value: 'Arx', label: 'Arx' },
  { value: 'Realistic', label: 'Realistic' },
  { value: 'TextureRainbow', label: 'Texture Rainbow' },
]

/**
 * The profile a level starts with.
 */
export const DEFAULT_LIGHTING_PROFILE: LightingProfile = 'Arx'

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
 * between the maps. A stored value this build does not know falls back to the default one.
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
 * Whether the palette of the level is being baked now.
 *
 * @remarks
 * The bake of a big level is about half a second (five with the shadow rays of the realistic profile), so it runs in
 * chunks and the page paints between them: the spinner of the widget follows this flag.
 */
export const isBakingLighting: ShallowRef<boolean> = shallowRef(false)

/**
 * The number of the bake the editor asked for last, so a bake of a profile the author already left is dropped.
 */
let bakeGeneration = 0

/**
 * Bakes the palette of the level with the profile of the widget.
 *
 * @remarks
 * The palette is the light of the level, and the material of the mesh is unlit: the bake writes the palette, and the
 * paint of the textures writes the colours of the geometry after it. The `Realistic` profile runs without the shadow
 * rays: the bake with them costs about five seconds on a big level, and the widget has no switch for it yet.
 *
 * The bake runs in chunks (the spinner of the widget shows it), and a bake that a newer profile change or a newer map
 * made stale writes nothing: the newer bake owns the palette.
 *
 * The bake runs at the start of the widget: a map that arrives is baked with the profile, and a profile change bakes
 * the map on the screen. The bake after every **step** is the next slice of the lighting round.
 */
export async function bakeLighting(): Promise<void> {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  bakeGeneration = bakeGeneration + 1

  const generation = bakeGeneration

  isBakingLighting.value = true

  try {
    const colors = await bakeLlfColorsInChunks(map.fts, map.llf, {
      mode: lightingProfile.value,
      occluders: map.solidMeshes,
      ambientFloor: 23,
      shadows: false,
    })

    // a newer profile or a newer map owns the palette: the colours of this bake are stale
    if (generation !== bakeGeneration) {
      return
    }

    map.llf.colors = colors

    // the repaint paints the baked colours and the textures again; the bump asks the views for a render (without it the
    // 3D view keeps its last frame until a mouse move)
    await repaintLevelTextures()
    bumpLevelRevision()
  } finally {
    if (generation === bakeGeneration) {
      isBakingLighting.value = false
    }
  }
}

/**
 * Bakes the palette of a level that is not on the screen yet.
 *
 * @remarks
 * The load calls it before the map is published: the new map is built, painted and baked in memory while the views keep
 * the old level, and the store swaps the two when the build is done. The palette of the file is the light of the game's
 * own editor, not the light of the profile, so its colours are thrown away first (the length stays: the vertices index
 * the palette by `llfColorIdx`) and the bake fills them.
 *
 * @param map The level to bake, before it goes to the views.
 */
export async function bakeLoadedMap(map: ArxMap): Promise<void> {
  map.llf.colors = map.llf.colors.map(() => {
    return { r: 0, g: 0, b: 0, a: 255 }
  })

  bakeGeneration = bakeGeneration + 1

  const generation = bakeGeneration

  isBakingLighting.value = true

  try {
    const colors = await bakeLlfColorsInChunks(map.fts, map.llf, {
      mode: lightingProfile.value,
      occluders: map.solidMeshes,
      ambientFloor: 23,
      shadows: false,
    })

    if (generation !== bakeGeneration) {
      return
    }

    map.llf.colors = colors

    // the mesh of the map carries the palette before the views wrap it: the first frame of the new level is the baked one
    writeBakedColors(map)
  } finally {
    if (generation === bakeGeneration) {
      isBakingLighting.value = false
    }
  }
}

/**
 * Prepares a new level for the views: its textures and its baked light.
 *
 * @remarks
 * The store publishes the map only after this step, so the views keep the level of before: the new one is built,
 * painted and baked in memory, and it arrives with the light of the profile (the palette of its file is thrown away by
 * {@link bakeLoadedMap}). Every load goes through here: the starter level of the App and the map of the list
 * ({@link ../../../modules/level/source/maps.ts}).
 *
 * @param map The level that is being built.
 * @param zipData The bytes of the zip the level came from, when it came from one.
 */
export async function prepareLoadedMap(map: ArxMap, zipData?: ArrayBuffer): Promise<void> {
  await paintLevel(map, zipData)
  await bakeLoadedMap(map)
}

let started = false

/**
 * Starts the lighting of the editor: a profile change bakes the palette of the map on the screen.
 *
 * @remarks
 * The load bakes its own map, before the views get it ({@link bakeLoadedMap}): what arrives on the screen already has
 * the light of the profile. This watch is the other half: the author picks another profile, and the map on the screen is
 * baked again.
 */
export function startLighting(): void {
  if (started) {
    return
  }

  started = true

  watch(lightingProfile, () => {
    void bakeLighting()
  })
}
