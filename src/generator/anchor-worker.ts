/**
 * A Web Worker around the anchor graph generator.
 *
 * The generation takes seconds on a real level (level 4: ~2 s, level 11: ~5 s), which would freeze
 * the editor - it has to happen while the user keeps navigating, so it runs here, off the main
 * thread. The polygons are sent as flat typed arrays (the structured clone of 70 000 `ArxPolygon`
 * objects would be much slower than a few megabytes of floats) and the result comes back the same
 * way.
 */

import { generateAnchors, type AnchorGeneratorOptions, type GeneratedAnchor } from './anchor-generator.js'

export type AnchorWorkerRequest = {
  /** 4 vertices per polygon, 3 floats each (x, y, z) - the 4th is ignored for triangles */
  positions: Float32Array
  /** 3 floats per polygon */
  normals: Float32Array
  flags: Uint32Array
  areas: Float32Array
  options: AnchorGeneratorOptions
}

export type AnchorWorkerResponse =
  | { ok: true; anchors: GeneratedAnchor[]; cellAnchors: Array<[number, number[]]> }
  | { ok: false; message: string }

self.onmessage = (event: MessageEvent<AnchorWorkerRequest>) => {
  try {
    const { positions, normals, flags, areas, options } = event.data
    const polygons = []

    for (let index = 0; index < flags.length; index++) {
      const vertexOffset = index * 12
      const normalOffset = index * 3
      const vertices = [0, 1, 2, 3].map((vertex) => {
        const offset = vertexOffset + vertex * 3

        return { x: positions[offset], y: positions[offset + 1], z: positions[offset + 2] }
      })

      polygons.push({
        vertices,
        norm: { x: normals[normalOffset], y: normals[normalOffset + 1], z: normals[normalOffset + 2] },
        flags: flags[index],
        area: areas[index],
      })
    }

    const result = generateAnchors(polygons, options)

    self.postMessage({
      ok: true,
      anchors: result.anchors,
      cellAnchors: [...result.cellAnchors],
    } satisfies AnchorWorkerResponse)
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) } satisfies AnchorWorkerResponse)
  }
}
