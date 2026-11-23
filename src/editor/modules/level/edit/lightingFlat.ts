import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * The light of the flat profile of a level, when the screen draws one gray on it.
 *
 * @remarks
 * The flat light is not the palette of the file: it is one gray over the whole level, and the levels without a palette
 * (a blank one) have no palette entry to carry it. The map keeps its value here, and the paint reads it for every corner
 * ({@link ../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts}); a map without a value draws its
 * palette.
 */
const flatLights = new WeakMap<ArxMap, number>()

/**
 * Sets the light of the flat profile of a level, or takes it away.
 *
 * @param map The level the light belongs to.
 * @param luminosity The gray from 0 (dark) to 1 (the brightest), or `undefined` for the palette.
 */
export function setFlatLight(map: ArxMap, luminosity: number | undefined): void {
  if (luminosity === undefined) {
    flatLights.delete(map)

    return
  }

  flatLights.set(map, luminosity)
}

/**
 * Reads the light of the flat profile of a level.
 *
 * @param map The level to read.
 *
 * @returns The gray from 0 to 1, or `undefined` when the level draws its palette.
 */
export function flatLightOf(map: ArxMap): number | undefined {
  return flatLights.get(map)
}
