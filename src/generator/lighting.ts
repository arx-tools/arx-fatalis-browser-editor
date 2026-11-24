/**
 * The light bake of the level: the light of the game on every corner, from the palette of the LLF.
 *
 * @remarks
 * The bake lives in files of their own under `lightingParts/`: `colors.ts` (the color of a light on a corner, the rainbow
 * and the ambient of the mode), `grid.ts` (the cell grid that finds the lights near a corner), `bake.ts` (the corner and
 * the walk of the faces), and `bakePublic.ts` (the three entries). This module names what the generator and the editor
 * call, so a part can move inside the folder without a change outside it.
 */

export type { CornerSpots, LightingOptions } from './lightingParts/types.ts'
export { bakeLlfColors, bakeLlfColorsAt, bakeLlfColorsInChunks } from './lightingParts/bakePublic.ts'
