import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { countFacesOfTriangles } from '../../src/generator/polygonCounts.ts'

void describe('countFacesOfTriangles', () => {
  void it('counts an empty mesh as nothing', () => {
    assert.deepEqual(countFacesOfTriangles([]), { faceCount: 0, triangleCount: 0, quadCount: 0 })
  })

  void it('counts a single triangle as a triangular face', () => {
    assert.deepEqual(countFacesOfTriangles([0]), { faceCount: 1, triangleCount: 1, quadCount: 0 })
  })

  void it('counts the two triangles of a quad as one face', () => {
    // the geometry splits a quad into two triangles, and the map marks both with the same polygon
    assert.deepEqual(countFacesOfTriangles([0, 0]), { faceCount: 1, triangleCount: 0, quadCount: 1 })
  })

  void it('counts a mix of triangles and quads', () => {
    // a triangle, a quad, and a triangle
    const counts = countFacesOfTriangles([0, 1, 1, 2])

    assert.deepEqual(counts, { faceCount: 3, triangleCount: 2, quadCount: 1 })
  })

  void it('adds up to the faces it is given', () => {
    const counts = countFacesOfTriangles([0, 0, 1, 2, 2, 3, 3])

    assert.equal(counts.triangleCount + counts.quadCount, counts.faceCount)
    assert.equal(counts.faceCount, 4)
  })
})
