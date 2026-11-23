import type { ArxColor } from 'arx-convert/types'
import { shallowRef, watch, type ShallowRef } from 'vue'
import { bakeLlfColorsInChunks } from '../../../../generator/lighting.ts'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { writeBakedColors } from './levelTextures/bakedColors.ts'
import { lightingCacheVersion } from './lightingCache.ts'
import { setFlatLight } from './lightingFlat.ts'
import {
  flatLightOfProfile,
  flatLuminosity,
  lightingProfile,
  paletteBakeOptionsOf,
  paletteKeyOf,
  rainbowLuminosity,
} from './lightingProfile.ts'
import { paintLevel, repaintLevelColors } from './levelTextures.ts'
import { levelStore } from './levelStore.ts'

/**
 * The profiles of the lighting, and what a bake of the palette reads.
 *
 * @remarks
 * The profile is a fact of the author, not of the level: it stays in the browser, and the widget shows it. This module
 * bakes with it; the refs and the options live in `lightingProfile.ts`, which the partial bake of a light edit reads
 * without the paint of the level.
 */
export {
  DEFAULT_LIGHTING_PROFILE,
  LIGHTING_PROFILES,
  flatLightOfProfile,
  flatLuminosity,
  hasLuminosity,
  isLightingProfile,
  isRainbowProfile,
  lightingProfile,
  paletteBakeOptionsOf,
  paletteKeyOf,
  rainbowLuminosity,
  readsPalette,
  type LightingProfile,
} from './lightingProfile.ts'

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
 * One baked palette of a level, with the version of the level it was baked from.
 */
type CachedPalette = {
  /**
   * The cache version of the level at the bake.
   */
  readonly version: number
  /**
   * The colors of the palette.
   */
  readonly colors: readonly ArxColor[]
}

/**
 * The palettes of the levels, by the level and its profile.
 *
 * @remarks
 * A dropdown change between two profiles would cost a bake of half a second each time; the palette of a profile is a
 * pure function of the level and the profile, so it is kept until a step changes the level (the version).
 */
const paletteCache = new WeakMap<ArxMap, Map<string, CachedPalette>>()

/**
 * Reads a cached palette of a level and a profile, when it is still the palette of the level.
 *
 * @param map The level the palette belongs to.
 * @param key The profile (and the luminosity) it was baked with.
 *
 * @returns The colors, or `undefined` when the entry is missing or stale.
 */
function cachedPaletteOf(map: ArxMap, key: string): readonly ArxColor[] | undefined {
  const entry = paletteCache.get(map)?.get(key)

  if (entry === undefined) {
    return undefined
  }

  if (entry.version !== lightingCacheVersion()) {
    return undefined
  }

  return entry.colors
}

/**
 * Keeps a baked palette for the next profile change.
 *
 * @param map The level the palette belongs to.
 * @param key The profile (and the luminosity) it was baked with.
 * @param colors The RGB of every entry of the palette.
 */
function rememberPaletteOf(map: ArxMap, key: string, colors: ArxColor[]): void {
  let byProfile = paletteCache.get(map)

  if (byProfile === undefined) {
    byProfile = new Map()
    paletteCache.set(map, byProfile)
  }

  byProfile.set(key, { version: lightingCacheVersion(), colors })
}

/**
 * Bakes the palette of the level with the profile of the widget.
 *
 * @remarks
 * The palette is the light of the level, and the material of the mesh is unlit: the bake writes the palette, and the
 * paint of the textures writes the colors of the geometry after it. The `Realistic` profile runs without the shadow
 * rays: the bake with them costs about five seconds on a big level, and the widget has no switch for it yet.
 *
 * The bake runs in chunks (the spinner of the widget shows it), and a bake that a newer profile change or a newer map
 * made stale writes nothing: the newer bake owns the palette.
 *
 * The bake runs at the start of the widget: a map that arrives is baked with the profile, and a profile change bakes
 * the map on the screen. A light edit does not come through here: it bakes only the corners its light changed (see
 * `lightPalette.ts`).
 */
export async function bakeLighting(): Promise<void> {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const profile = lightingProfile.value

  setFlatLight(map, flatLightOfProfile(profile, flatLuminosity.value))

  const key = paletteKeyOf(profile, flatLuminosity.value, rainbowLuminosity.value)
  const cached = cachedPaletteOf(map, key)

  if (cached !== undefined) {
    // the palette of the profile is already computed: the colors go onto the mesh, and only the paint runs
    map.llf.colors = [...cached]
    repaintLevelColors()

    return
  }

  bakeGeneration = bakeGeneration + 1

  const generation = bakeGeneration

  isBakingLighting.value = true

  try {
    const colors = await bakeLlfColorsInChunks(map.fts, map.llf, paletteBakeOptionsOf(map))

    // a newer profile or a newer map owns the palette: the colors of this bake are stale
    if (generation !== bakeGeneration) {
      return
    }

    map.llf.colors = colors
    rememberPaletteOf(map, key, colors)

    // the repaint paints the baked colors and the textures again; the bump of the paint asks the views for a render
    repaintLevelColors()
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
 * own editor, not the light of the profile, so its colors are thrown away first (the length stays: the vertices index
 * the palette by `llfColorIdx`) and the bake fills them.
 *
 * @param map The level to bake, before it goes to the views.
 */
export async function bakeLoadedMap(map: ArxMap): Promise<void> {
  setFlatLight(map, flatLightOfProfile(lightingProfile.value, flatLuminosity.value))
  map.llf.colors = map.llf.colors.map(() => {
    return { r: 0, g: 0, b: 0, a: 255 }
  })

  bakeGeneration = bakeGeneration + 1

  const generation = bakeGeneration

  isBakingLighting.value = true

  try {
    const colors = await bakeLlfColorsInChunks(map.fts, map.llf, paletteBakeOptionsOf(map))

    if (generation !== bakeGeneration) {
      return
    }

    map.llf.colors = colors
    rememberPaletteOf(map, paletteKeyOf(lightingProfile.value, flatLuminosity.value, rainbowLuminosity.value), colors)

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

  watch([flatLuminosity, rainbowLuminosity], () => {
    void bakeLighting()
  })
}
