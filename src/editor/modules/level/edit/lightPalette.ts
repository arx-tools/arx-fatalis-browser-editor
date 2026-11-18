import type { ArxLight } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { bakeLlfColorsAround } from '../../../../generator/lighting.ts'
import { writeBakedCornerColors } from './levelTextures/bakedColors.ts'
import { bumpLightingCacheVersion } from './lightingCache.ts'
import { paletteBakeOptionsOf, readsPalette } from './lightingProfile.ts'

/**
 * One light an edit touched: the light before the edit and the light after it.
 *
 * @remarks
 * The two states are what the partial bake needs, not only the new one: the corners a light **used to** reach have to go
 * back to the light of the other lamps when the light shrinks, moves away or stops baking, and those corners are the
 * ones the sphere of its old place holds.
 */
export type LightPaletteChange = {
  /**
   * The light before the edit.
   */
  readonly before: ArxLight
  /**
   * The light after it.
   */
  readonly after: ArxLight
}

/**
 * The spheres of the two states of every changed light, without the repeats.
 *
 * @remarks
 * The reach of a light is its `fallEnd` around its position, so two states with the same place and the same end are the
 * same sphere: a colour or an intensity edit gives one sphere instead of two, and the walk of the level is the same.
 *
 * @param changed The lights the edit touched.
 *
 * @returns The lights whose spheres mark the corners to bake.
 */
function reachOf(changed: readonly LightPaletteChange[]): ArxLight[] {
  const seen = new Set<string>()
  const reach: ArxLight[] = []

  for (const change of changed) {
    for (const light of [change.before, change.after]) {
      const { x, y, z } = light.position
      const key = `${String(x)},${String(y)},${String(z)},${String(light.fallEnd)}`

      if (!seen.has(key)) {
        seen.add(key)
        reach.push(light)
      }
    }
  }

  return reach
}

/**
 * Bakes the palette again where the lights an edit touched have changed it.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the level has to follow it without the bake of the
 * whole palette (about half a second on a big level). Only the corners the **old** and the **new** sphere of a changed
 * light reach are baked, with the math of the full bake, and only those entries of the palette and of the `color`
 * attribute of the mesh are written. The entries no light of the edit reaches keep their colour: the edit can not reach
 * them.
 *
 * The bake follows the profile of the widget: the flat and the rainbow ones do not read the lights, so there is nothing
 * to bake there. The palette cache of the profiles is dropped, because the palette of the level is not the one the last
 * full bake wrote.
 *
 * @param map The level the lights belong to.
 * @param changed The lights the edit touched, with the two states of each.
 */
export function refreshLightPalette(map: ArxMap, changed: readonly LightPaletteChange[]): void {
  const options = paletteBakeOptionsOf(map)

  if (!readsPalette(options.mode)) {
    return
  }

  const colors = bakeLlfColorsAround(map.fts, map.llf, options, reachOf(changed))

  if (colors.size === 0) {
    return
  }

  for (const [index, color] of colors) {
    if (index < map.llf.colors.length) {
      map.llf.colors[index] = color
    }
  }

  bumpLightingCacheVersion()
  writeBakedCornerColors(map, new Set(colors.keys()))
}
