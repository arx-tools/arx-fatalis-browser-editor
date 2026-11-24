import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import type { ArxMap } from '../../../../generator/ArxMap.ts'
import { bakeLlfColorsAt } from '../../../../generator/lighting.ts'
import { bakedCornersOf, cornersWithin, writeBakedCornerColors, type LightSphere } from './levelTextures/bakedColors.ts'
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
 * The reach of a light is its `fallEnd` around its position, in the frame of the scene (the bake mirrors the position of
 * the light, the way the mesh is mirrored). Two states with the same place and the same end are the same sphere: a
 * color or an intensity edit gives one sphere instead of two, and the walk of the corners is the same.
 *
 * A **semidynamic** light is left out: the palette of a level is the light of its static lights (a torch is lit at
 * runtime), so a bake for one would write the static light of the corners over the layer that draws the torch, which
 * blinked the torch on every frame of a drag (2026-11-23, the owner).
 *
 * @param changed The lights the edit touched.
 *
 * @returns The spheres whose corners the bake takes.
 */
function spheresOf(changed: readonly LightPaletteChange[]): LightSphere[] {
  const seen = new Set<string>()
  const spheres: LightSphere[] = []

  for (const change of changed) {
    for (const light of [change.before, change.after]) {
      if ((light.flags & ArxLightFlags.SemiDynamic) !== 0) {
        continue
      }

      const { x, y, z } = light.position
      const key = `${String(x)},${String(y)},${String(z)},${String(light.fallEnd)}`

      if (!seen.has(key)) {
        seen.add(key)
        spheres.push({ x: -x, y: -y, z, radius: light.fallEnd })
      }
    }
  }

  return spheres
}

/**
 * Bakes the light of the faces that moved, with the profile of the level.
 *
 * @remarks
 * A face that moves (a paste, a translate, a rotate, a scale) takes the light of its new place: the corners it owns are
 * baked again and only those are written, so a move stays cheap on a big level. A profile that does not read the lights
 * (the flat and the rainbow) needs nothing.
 *
 * @param map The level the faces belong to.
 * @param faces The indices of the faces that moved.
 */
export function refreshLightPaletteOfFaces(map: ArxMap, faces: readonly number[]): void {
  const options = paletteBakeOptionsOf(map)

  if (!readsPalette(options.mode)) {
    return
  }

  const corners = bakedCornersOf(map)

  if (corners === undefined) {
    return
  }

  const wanted = new Set<number>()

  for (const index of faces) {
    const polygon = map.polygons[index]

    if (polygon === undefined) {
      continue
    }

    for (const vertex of polygon.vertices) {
      if (vertex.llfColorIdx !== undefined) {
        wanted.add(vertex.llfColorIdx)
      }
    }
  }

  const reached: number[] = []

  for (let entry = 0; entry < corners.count; entry = entry + 1) {
    if (wanted.has(corners.paletteIndexes[entry] ?? -1)) {
      reached.push(entry)
    }
  }

  if (reached.length === 0) {
    return
  }

  const colors = bakeLlfColorsAt(map.llf, options, corners, reached)

  if (colors.size === 0) {
    return
  }

  for (const [index, color] of colors) {
    if (index < map.llf.colors.length) {
      map.llf.colors[index] = color
    }
  }

  bumpLightingCacheVersion()
  writeBakedCornerColors(map, corners, reached)
}

/**
 * Bakes the palette again where the lights an edit touched have changed it.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the level has to follow it without the bake of the
 * whole palette (about half a second on a big level). Only the corners the **old** and the **new** sphere of a changed
 * light reach are baked, with the math and the light order of the full bake, and only those entries of the palette and
 * of the `color` attribute of the mesh are written. The corners no light of the edit reaches keep their color: the edit
 * can not reach them.
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

  const corners = bakedCornersOf(map)
  const spheres = spheresOf(changed)

  if (corners === undefined || spheres.length === 0) {
    return
  }

  const reached = cornersWithin(corners, spheres)

  if (reached.length === 0) {
    return
  }

  const colors = bakeLlfColorsAt(map.llf, options, corners, reached)

  if (colors.size === 0) {
    return
  }

  for (const [index, color] of colors) {
    if (index < map.llf.colors.length) {
      map.llf.colors[index] = color
    }
  }

  bumpLightingCacheVersion()
  writeBakedCornerColors(map, corners, reached)
}
