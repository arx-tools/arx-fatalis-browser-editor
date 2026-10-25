import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags } from 'arx-convert/types'
import { isDoubleSided, isNoDraw, isTransparent, percentOf } from '../src/functions.ts'

void describe('percentOf', () => {
  void it('scales a value by a percentage', () => {
    assert.equal(percentOf(50, 200), 100)
    assert.equal(percentOf(0, 200), 0)
    assert.equal(percentOf(100, 200), 200)
    assert.equal(percentOf(25, 256), 64)
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
