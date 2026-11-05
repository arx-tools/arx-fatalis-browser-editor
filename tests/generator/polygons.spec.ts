import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon, type ArxVector3 } from 'arx-convert/types'
import {
  blendModeOf,
  blendTransOf,
  isTouchingVertices,
  polygonFillTriangles,
  polygonOfTriangle,
  polygonPerimeter,
  sameTextureAreaOf,
  triangleToPolygonMap,
  usedVerticesOf,
  vertexKeyOf,
  vertexToPolygonsMap,
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

/**
 * A 10 unit quad of the test, moved along `x` and given a texture.
 *
 * @param x Where the left edge of the quad sits.
 * @param textureContainerId Which texture container the quad belongs to.
 *
 * @returns The same square, with its left edge on `x` and its own texture.
 */
function quadAt(x: number, textureContainerId: number): ArxPolygon {
  const base = polygon(true)

  return {
    ...base,
    textureContainerId,
    vertices: [
      { ...base.vertices[0], x: base.vertices[0].x + x },
      { ...base.vertices[1], x: base.vertices[1].x + x },
      { ...base.vertices[2], x: base.vertices[2].x + x },
      { ...base.vertices[3], x: base.vertices[3].x + x },
    ],
  }
}

void describe('usedVerticesOf', () => {
  void it('gives three vertices for a triangle', () => {
    assert.equal(usedVerticesOf(polygon(false)).length, 3)
  })

  void it('gives four vertices for a quad', () => {
    assert.equal(usedVerticesOf(polygon(true)).length, 4)
  })
})

void describe('vertexKeyOf', () => {
  void it('rounds the position, so a rounding difference still meets', () => {
    assert.equal(vertexKeyOf({ x: 1.0001, y: 2.0002, z: 3.0003 }), vertexKeyOf({ x: 1, y: 2, z: 3 }))
  })

  void it('welds a seam of a few thousandths of a unit, like the two halves of the level 0 floor', () => {
    // the two pieces of the floor sit at 1780.7126 and 1780.7159, and the player sees one floor: the key is a tenth,
    // so they meet (measured on level 0: the double click went from 110 + 122 faces to one area of 232)
    assert.equal(vertexKeyOf({ x: 8550, y: 1780.7126, z: 10_050 }), vertexKeyOf({ x: 8550, y: 1780.7159, z: 10_050 }))
  })
})

void describe('vertexToPolygonsMap', () => {
  void it('groups the polygons that share a vertex position', () => {
    // the two quads start at the same `x`: they share their left edge
    const index = vertexToPolygonsMap([quadAt(0, 1), quadAt(0, 2), quadAt(20, 1)])

    assert.deepEqual(index.get('0.0:0.0:0.0'), [0, 1])
    // the two quads at the same place share all four of their keys, the third one adds four more
    assert.equal(index.size, 8)
  })
})

void describe('isTouchingVertices', () => {
  void it('takes anything when nothing is selected yet', () => {
    assert.equal(isTouchingVertices(polygon(true), []), true)
  })

  void it('touches a polygon that shares a vertex', () => {
    const other = quadAt(0, 1)

    assert.equal(isTouchingVertices(quadAt(10, 1), usedVerticesOf(other)), true)
  })

  void it('does not touch a polygon that only lies close in space', () => {
    const other = quadAt(0, 1)

    assert.equal(isTouchingVertices(quadAt(20, 1), usedVerticesOf(other)), false)
  })
})

void describe('sameTextureAreaOf', () => {
  void it('walks the welded area of one texture', () => {
    // three quads in a row: 0 and 1 share an edge, 2 is a gap away
    const polygons = [quadAt(0, 1), quadAt(10, 1), quadAt(40, 1)]
    const area = sameTextureAreaOf(polygons, vertexToPolygonsMap(polygons), 0)

    // 0 and 1 touch at x = 10; the second quad spans 10..20, so 2 (40..50) is not welded to it
    assert.deepEqual(
      area.toSorted((a, b) => {
        return a - b
      }),
      [0, 1],
    )
  })

  void it('stops where the texture changes', () => {
    const polygons = [quadAt(0, 1), quadAt(10, 2)]
    const area = sameTextureAreaOf(polygons, vertexToPolygonsMap(polygons), 0)

    assert.deepEqual(area, [0])
  })

  void it('gives nothing for a polygon that is not in the list', () => {
    const polygons = [quadAt(0, 1)]

    assert.deepEqual(sameTextureAreaOf(polygons, vertexToPolygonsMap(polygons), 7), [])
  })
})

void describe('blendModeOf', () => {
  void it('reads an opaque face without the transparent bit', () => {
    assert.equal(blendModeOf({ flags: 0, transval: 0 }), 'opaque')
    assert.equal(blendModeOf({ flags: ArxPolygonFlags.Quad, transval: 3 }), 'opaque')
  })

  void it('reads the four blended modes of a transparent face', () => {
    const transparent = ArxPolygonFlags.Transparent

    assert.equal(blendModeOf({ flags: transparent, transval: 2 }), 'multiplicative')
    assert.equal(blendModeOf({ flags: transparent, transval: 1.25 }), 'additive')
    assert.equal(blendModeOf({ flags: transparent, transval: 0.05 }), 'alpha')
    assert.equal(blendModeOf({ flags: transparent, transval: -0.95 }), 'subtractive')
  })
})

void describe('blendTransOf', () => {
  void it('gives an opaque face the white of no modulation', () => {
    assert.equal(blendTransOf({ flags: 0, transval: 0.5 }), 1)
  })

  void it('reads the brightness the game multiplies the texture with', () => {
    const transparent = ArxPolygonFlags.Transparent

    // the values of the game: 1.25 turns into 0.25, -0.95 into 1.95, 0.05 into 0.95
    assert.equal(blendTransOf({ flags: transparent, transval: 1.25 }), 0.25)
    assert.equal(blendTransOf({ flags: transparent, transval: -0.95 }), 1.95)
    assert.equal(blendTransOf({ flags: transparent, transval: 0.05 }), 0.95)
    assert.equal(blendTransOf({ flags: transparent, transval: 2.5 }), 1.75)
  })
})
