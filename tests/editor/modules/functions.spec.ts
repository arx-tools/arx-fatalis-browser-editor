import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags } from 'arx-convert/types'
import {
  isDoubleSided,
  isNoDraw,
  isTransparent,
  parseNumberTriplet,
  roundToNDecimals,
  roundTriplet,
  wait,
} from '../../../src/editor/modules/functions.ts'

void describe('wait', () => {
  void it('waits for roughly the given time', async () => {
    // `performance.now` is sub millisecond and the timer may fire a hair early, so the check keeps
    // a margin: an immediate resolve would still be caught
    const startedAt = performance.now()
    await wait(20)

    assert.ok(performance.now() - startedAt >= 15)
  })
})

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

void describe('polygon flags', () => {
  // the flags are a bit field: the three checks have to read their own bit and nothing else
  void it('reads the transparent flag', () => {
    assert.equal(isTransparent(ArxPolygonFlags.Transparent), true)
    assert.equal(isTransparent(ArxPolygonFlags.DoubleSided), false)
    assert.equal(isTransparent(0), false)
  })

  void it('reads the double sided flag', () => {
    assert.equal(isDoubleSided(ArxPolygonFlags.DoubleSided), true)
    assert.equal(isDoubleSided(ArxPolygonFlags.Transparent), false)
    assert.equal(isDoubleSided(0), false)
  })

  void it('reads the no draw flag', () => {
    assert.equal(isNoDraw(ArxPolygonFlags.NoDraw), true)
    assert.equal(isNoDraw(ArxPolygonFlags.DoubleSided), false)
    assert.equal(isNoDraw(0), false)
  })

  void it('reads the flags independently of each other', () => {
    const combined = ArxPolygonFlags.Transparent | ArxPolygonFlags.DoubleSided

    assert.equal(isTransparent(combined), true)
    assert.equal(isDoubleSided(combined), true)
    assert.equal(isNoDraw(combined), false)
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
