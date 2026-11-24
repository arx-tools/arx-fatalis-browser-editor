import { HISTORY_RECORD_VERSION, type BuildTunnelOptions, type BuildTunnelRecord } from './types.ts'

/**
 * Builds the record of a tunnel, the way a step writes it down.
 *
 * @remarks
 * The faces of the wall are sorted and made unique, so the same selection gives the same record. The polygons of the
 * tunnel are the ones the builder made; the block of colors is copied, so the record does not share the palette of the
 * level.
 *
 * **Parked with the tunnel POC (2026-11-17):** the editor has no UI for it any more; the CSG-based tunnel digging will
 * replace it or reuse it.
 *
 * @param options The faces of the wall, the polygons of the tunnel and what they need.
 *
 * @returns The record of the step.
 */
export function createBuildTunnelRecord(options: BuildTunnelOptions): BuildTunnelRecord {
  const unique = [...new Set(options.removed)].toSorted((one, other) => {
    return one - other
  })

  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'buildTunnel',
    removed: unique,
    added: [...options.added],
    texture: options.texture,
    addedTexture: options.addedTexture,
    lighting: options.lighting.map((color) => {
      return { r: color.r, g: color.g, b: color.b, a: color.a }
    }),
    portals: [...options.portals],
  }
}
