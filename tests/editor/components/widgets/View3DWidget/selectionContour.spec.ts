import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { sameFaceListOf } from '../../../../../src/editor/components/widgets/View3DWidget/selectionContour.ts'

/**
 * Builds a face of the test.
 *
 * @param x The X of its first corner: the faces of a list are told apart by it.
 *
 * @returns A face, the way the level holds one.
 */
function faceOf(x: number): ArxPolygon {
  return { vertices: [{ x, y: 0, z: 0 }] } as unknown as ArxPolygon
}

void describe('sameFaceListOf', () => {
  void it('sees the same faces in two lists a pick made twice', () => {
    const faces = [faceOf(0), faceOf(1)]

    assert.equal(sameFaceListOf(faces, [faces[0], faces[1]] as ArxPolygon[]), true)
  })

  void it('tells a list of another group apart', () => {
    assert.equal(sameFaceListOf([faceOf(0), faceOf(1)], [faceOf(0), faceOf(2)]), false)
  })

  void it('tells a longer or a shorter list apart', () => {
    assert.equal(sameFaceListOf([faceOf(0)], [faceOf(0), faceOf(1)]), false)
    assert.equal(sameFaceListOf([faceOf(0), faceOf(1)], [faceOf(0)]), false)
  })

  void it('sees two empty lists as the same', () => {
    assert.equal(sameFaceListOf([], []), true)
  })
})
