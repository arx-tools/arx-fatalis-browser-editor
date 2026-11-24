import { type Side, MeshBasicMaterial } from 'three'

/**
 * How the flat material of the level draws.
 */
export type LevelMaterialOptions = {
  /**
   * The side the material draws, `FrontSide` by default.
   */
  readonly side?: Side
}

/**
 * Builds the material of the level mesh.
 *
 * @remarks
 * The material is **unlit**: the light of the level is baked into the palette of the LLF, and the `color` attribute of
 * the geometry carries it (the paint writes it), so the mesh has to show that color and not the light of the scene.
 * Without a palette the attribute is white, which is the flat look of a level that has no lighting yet.
 *
 * @param options How the material draws; the two sides of a face are the default (`FrontSide`).
 *
 * @returns The material the mesh of the level is drawn with.
 */
export function createLevelMaterial(options: LevelMaterialOptions = {}): MeshBasicMaterial {
  const material = new MeshBasicMaterial({ color: 0xff_ff_ff, vertexColors: true })

  if (options.side !== undefined) {
    material.side = options.side
  }

  return material
}
