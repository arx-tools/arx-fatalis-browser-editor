/**
 * Type declarations for the dependency free anchor graph generator (`anchor-generator.js`).
 *
 * The implementation is a plain `.js` on purpose: it is the first module of the future
 * `arx-level-generator2` `src/generator`, shared with the browser editor unchanged (no three.js, no
 * DOM). The types the editor uses are declared here.
 */

export type GeneratorVector = { x: number; y: number; z: number }

/** the parts of an `ArxPolygon` the generator reads */
export type GeneratorPolygon = {
  vertices: GeneratorVector[]
  norm: GeneratorVector
  flags: number
  area?: number
}

export type AnchorGeneratorOptions = {
  gridSize?: number
  linkDistance?: number
  maxStepHeight?: number
  minHeadroom?: number
  minAbsNormalY?: number
  unwalkableFlags?: number
  upSign?: 1 | -1 | 'auto'
  minZ?: number
  maxZ?: number
  linkBodyRadius?: number
  linkRayHeight?: number
  coverage?: boolean
  anchorMinDistance?: number
  coverageMinAbsNormalY?: number
  coverageRadius?: number
  coverageHeightRadius?: number
  coverageMinArea?: number
}

export type GeneratedAnchor = {
  position: GeneratorVector
  linkedAnchors: number[]
}

export type AnchorGeneratorResult = {
  anchors: GeneratedAnchor[]
  cellAnchors: Map<number, number[]>
  stats: Record<string, unknown>
  polygons: GeneratorPolygon[]
}

export const ANCHOR_DEFAULTS: Required<AnchorGeneratorOptions>
export const UNWALKABLE_FLAGS: number

export function generateAnchors(
  polygons: GeneratorPolygon[],
  options?: AnchorGeneratorOptions,
): AnchorGeneratorResult

export function validateAnchors(
  result: Pick<AnchorGeneratorResult, 'anchors' | 'cellAnchors'>,
  options?: { minZ?: number | null; maxZ?: number | null },
): string[]
