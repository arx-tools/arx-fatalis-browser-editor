import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { countPolygonShapes } from '../../src/generator/polygonCounts.ts'

/**
 * A polygon of the test, with the given flags: the count reads nothing else.
 *
 * @param flags The bits the polygon should carry; only the quad bit matters for the count.
 *
 * @returns The polygon, with the given flags.
 */
function polygon(flags: number): ArxPolygon {
  return { flags } as unknown as ArxPolygon
}

void describe('countPolygonShapes', () => {
  void it('counts an empty scene as nothing', () => {
    assert.deepEqual(countPolygonShapes([]), { triangleCount: 0, quadCount: 0 })
  })

  void it('counts the polygons with the quad flag as quads', () => {
    const counts = countPolygonShapes([polygon(ArxPolygonFlags.Quad), polygon(ArxPolygonFlags.Quad)])

    assert.deepEqual(counts, { triangleCount: 0, quadCount: 2 })
  })

  void it('counts the polygons without the quad flag as triangles', () => {
    const counts = countPolygonShapes([polygon(ArxPolygonFlags.None), polygon(ArxPolygonFlags.DoubleSided)])

    assert.deepEqual(counts, { triangleCount: 2, quadCount: 0 })
  })

  void it('reads the quad flag out of a mix of other flags', () => {
    const counts = countPolygonShapes([
      polygon(ArxPolygonFlags.Quad | ArxPolygonFlags.Water | ArxPolygonFlags.NoShadow),
      polygon(ArxPolygonFlags.Water),
      polygon(ArxPolygonFlags.Quad | ArxPolygonFlags.Glow),
    ])

    assert.deepEqual(counts, { triangleCount: 1, quadCount: 2 })
  })

  void it('leaves no polygon out of the two counts', () => {
    const polygons = [
      polygon(ArxPolygonFlags.Quad),
      polygon(ArxPolygonFlags.None),
      polygon(ArxPolygonFlags.Quad | ArxPolygonFlags.Lava),
      polygon(ArxPolygonFlags.Metal),
    ]
    const counts = countPolygonShapes(polygons)

    assert.equal(counts.triangleCount + counts.quadCount, polygons.length)
  })
})
