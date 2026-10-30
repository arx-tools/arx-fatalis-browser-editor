import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  polygonFillTriangles,
  polygonOfTriangle,
  polygonPerimeter,
  triangleToPolygonMap,
} from '../../src/generator/polygons.ts'

/**
 * A flat polygon of the test, with four vertices at the same height.
 *
 * @param isQuad `true` for a quad, `false` for a triangle.
 *
 * @returns It, with the quad flag when it is a quad.
 */
function polygon(isQuad: boolean): ArxPolygon {
  let flags: number = ArxPolygonFlags.None

  if (isQuad) {
    flags = ArxPolygonFlags.Quad
  }

  const normal: ArxVector3 = { x: 0, y: 1, z: 0 }

  return {
    vertices: [
      { x: 0, y: 0, z: 0, u: 0, v: 0 },
      { x: 10, y: 0, z: 0, u: 1, v: 0 },
      { x: 10, y: 0, z: 10, u: 1, v: 1 },
      { x: 0, y: 0, z: 10, u: 0, v: 1 },
    ],
    textureContainerId: 1,
    norm: normal,
    norm2: normal,
    transval: 0,
    area: 100,
    flags,
    room: 1,
  }
}

void describe('polygonPerimeter', () => {
  void it('walks a triangle around its three corners', () => {
    assert.deepEqual(polygonPerimeter(polygon(false)), [0, 1, 2])
  })

  void it('walks a quad around its four corners, without the diagonal', () => {
    // the stored order is a "Z", so the perimeter is 0-1-3-2
    assert.deepEqual(polygonPerimeter(polygon(true)), [0, 1, 3, 2])
  })
})

void describe('polygonFillTriangles', () => {
  void it('gives one triangle for a triangle', () => {
    assert.deepEqual(polygonFillTriangles(polygon(false)), [[0, 1, 2]])
  })

  void it('splits a quad along b-c, the way the geometry does', () => {
    assert.deepEqual(polygonFillTriangles(polygon(true)), [
      [0, 1, 2],
      [2, 1, 3],
    ])
  })
})

void describe('triangleToPolygonMap', () => {
  void it('counts a triangle polygon once and a quad twice', () => {
    assert.deepEqual(triangleToPolygonMap([polygon(false), polygon(true)]), [0, 1, 1])
  })

  void it('keeps the order of the polygons', () => {
    assert.deepEqual(triangleToPolygonMap([polygon(true), polygon(false)]), [0, 0, 1])
  })

  void it('is empty without a polygon', () => {
    assert.deepEqual(triangleToPolygonMap([]), [])
  })
})

void describe('polygonOfTriangle', () => {
  void it('reads the polygon of a triangle', () => {
    assert.equal(polygonOfTriangle([0, 1, 1], 2), 1)
  })

  void it('reads nothing for a triangle out of the map', () => {
    assert.equal(polygonOfTriangle([0, 1, 1], 3), undefined)
  })
})
