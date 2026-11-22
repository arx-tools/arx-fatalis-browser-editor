import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { steppedFaceOf } from '../../../../src/editor/modules/selection/faceStepping.ts'

void describe('steppedFaceOf', () => {
  const faces = [2, 5, 9]

  void it('starts at the first face of the selection', () => {
    assert.strictEqual(steppedFaceOf(faces, undefined, 'next'), 2)
    assert.strictEqual(steppedFaceOf(faces, undefined, 'previous'), 9)
  })

  void it('walks the faces in the order of the level', () => {
    assert.strictEqual(steppedFaceOf(faces, 2, 'next'), 5)
    assert.strictEqual(steppedFaceOf(faces, 5, 'next'), 9)
    assert.strictEqual(steppedFaceOf(faces, 5, 'previous'), 2)
    assert.strictEqual(steppedFaceOf(faces, 9, 'previous'), 5)
  })

  void it('wraps around the two ends', () => {
    assert.strictEqual(steppedFaceOf(faces, 9, 'next'), 2)
    assert.strictEqual(steppedFaceOf(faces, 2, 'previous'), 9)
  })

  void it('starts the ring over for a face that left the selection', () => {
    assert.strictEqual(steppedFaceOf(faces, 7, 'next'), 2)
    assert.strictEqual(steppedFaceOf(faces, 7, 'previous'), 9)
  })

  void it('lands on the only face of a selection of one', () => {
    assert.strictEqual(steppedFaceOf([4], 4, 'next'), 4)
    assert.strictEqual(steppedFaceOf([4], undefined, 'previous'), 4)
  })

  void it('finds no face in an empty selection', () => {
    assert.strictEqual(steppedFaceOf([], undefined, 'next'), undefined)
    assert.strictEqual(steppedFaceOf([], 3, 'previous'), undefined)
  })
})
