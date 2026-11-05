import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseNumberTriplet, roundToNDecimals, roundTriplet } from '../../../src/editor/modules/numbers.ts'

void describe('roundToNDecimals', () => {
  void it('rounds to the given number of decimals', () => {
    assert.equal(roundToNDecimals(1.239, 2), 1.24)
    assert.equal(roundToNDecimals(-2.341, 2), -2.34)
    assert.equal(roundToNDecimals(1.6, 0), 2)
    assert.equal(roundToNDecimals(1.25, 1), 1.3)
  })

  void it('keeps a value which has fewer decimals', () => {
    assert.equal(roundToNDecimals(3, 2), 3)
    assert.equal(roundToNDecimals(1.5, 2), 1.5)
  })
})

void describe('roundTriplet', () => {
  void it('rounds every part to two decimals', () => {
    assert.deepEqual(roundTriplet([1.239, -2.341, 3]), [1.24, -2.34, 3])
  })

  void it('keeps a value which is already rounded', () => {
    assert.deepEqual(roundTriplet([1.25, 0, -3.5]), [1.25, 0, -3.5])
  })
})

void describe('parseNumberTriplet', () => {
  void it('parses three numbers', () => {
    assert.deepEqual(parseNumberTriplet('1,2,3'), [1, 2, 3])
    assert.deepEqual(parseNumberTriplet('1.5, -2, 0.25'), [1.5, -2, 0.25])
  })

  void it('rejects a list which is not a triplet', () => {
    assert.equal(parseNumberTriplet('1,2'), undefined)
    assert.equal(parseNumberTriplet('1,2,3,4'), undefined)
  })

  void it('rejects a value which is not a number', () => {
    assert.equal(parseNumberTriplet('1,two,3'), undefined)
    assert.equal(parseNumberTriplet(''), undefined)
  })
})
