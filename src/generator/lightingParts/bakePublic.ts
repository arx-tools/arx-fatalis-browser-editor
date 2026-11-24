import type { ArxColor, ArxFTS, ArxLLF } from 'arx-convert/types'
import {
  bakeLlfColorsSteps,
  CHUNK_CORNERS,
  bakeContextOf,
  bakeCornerOf,
  fillCandidatesOf,
  letThePagePaint,
} from './bake.ts'
import { collectLights } from './colors.ts'
import { lightGridOf } from './grid.ts'
import type { CornerSpots, LightGrid, LightingOptions } from './types.ts'

/**
 * Bakes the palette of the level from its lights.
 *
 * @remarks
 * The synchronous bake: the tests and any caller that has no page to paint use it. The editor uses
 * {@link bakeLlfColorsInChunks}, so its spinner moves while the palette is computed.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level, with the lights and the palette.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The colors of the palette, one for every entry of the lighting.
 */
export function bakeLlfColors(fts: ArxFTS, llf: ArxLLF, options: LightingOptions): ArxColor[] {
  const steps = bakeLlfColorsSteps(fts, llf, options)
  let step = steps.next()

  while (!step.done) {
    step = steps.next()
  }

  return step.value
}

/**
 * Bakes the palette of the level from its lights, in chunks.
 *
 * @remarks
 * The same palette as {@link bakeLlfColors}, but the page paints between the chunks: the bake of a big level is about
 * half a second, and the editor shows a spinner while it runs. A chunk is {@link CHUNK_CORNERS} corners, then a turn of
 * the event loop.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level, with the lights and the palette.
 * @param options The profile of the bake and what it reads.
 *
 * @returns The colors of the palette, when every chunk is done.
 */
export async function bakeLlfColorsInChunks(fts: ArxFTS, llf: ArxLLF, options: LightingOptions): Promise<ArxColor[]> {
  const steps = bakeLlfColorsSteps(fts, llf, options)
  let step = steps.next()
  let budget = CHUNK_CORNERS

  while (!step.done) {
    budget = budget - 1

    if (budget <= 0) {
      budget = CHUNK_CORNERS
      await letThePagePaint()
    }

    step = steps.next()
  }

  return step.value
}

/**
 * Bakes the palette entries of some corners of the level.
 *
 * @remarks
 * The light editor writes a light on every frame of a drag, and the palette has to follow it: the full bake would be
 * half a second on a big level, so this one bakes only the corners the edit reached (see `cornersWithin` in the editor:
 * the corners the light **before** the edit and the light **after** it reach, because a light that shrinks or moves
 * away has to give its old corners back to the other lights).
 *
 * The color of an entry is the one the full bake would write: every corner is baked from **all** the lights of the
 * level, with the same math and in the same order ({@link bakeCornerOf}), and the lights a corner can not take are
 * filtered out by the grid of the level ({@link LightGrid}).
 *
 * The modes that do not read the lights (`MaxBrightness`, `CompleteDarkness`, `TextureRainbow`, `Flat`) give an empty
 * map: their palette is not the light of the level.
 *
 * @param llf The lighting of the level: the lights and the palette.
 * @param options The profile of the bake and what it reads.
 * @param spots The corners of the level, in the frame of the scene.
 * @param entries The corners to bake, by their entry in the spots.
 *
 * @returns The new color of every affected palette entry, by its index in the palette.
 */
export function bakeLlfColorsAt(
  llf: ArxLLF,
  options: LightingOptions,
  spots: CornerSpots,
  entries: readonly number[],
): Map<number, ArxColor> {
  const colors = new Map<number, ArxColor>()
  const lights = collectLights(llf)
  const grid = lightGridOf(llf, lights)
  const context = bakeContextOf(lights, options, grid)

  if (context === undefined) {
    return colors
  }

  const { corner } = context

  for (const entry of entries) {
    const index = spots.paletteIndexes[entry] ?? -1

    if (index < 0) {
      continue
    }

    const at = entry * 3

    corner.position.set(spots.positions[at] ?? 0, spots.positions[at + 1] ?? 0, spots.positions[at + 2] ?? 0)
    corner.normal.set(spots.normals[at] ?? 0, spots.normals[at + 1] ?? 0, spots.normals[at + 2] ?? 0).normalize()

    if (grid !== undefined) {
      fillCandidatesOf(context, grid)
    }

    colors.set(index, bakeCornerOf(corner, spots.doubleSided[entry] === 1))
  }

  return colors
}
