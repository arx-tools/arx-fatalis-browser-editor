import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCount, formatSize } from '../../../src/editor/modules/format.ts'

void describe('formatCount', () => {
  void it('writes a small number as it is', () => {
    assert.equal(formatCount(8), '8')
    assert.equal(formatCount(0), '0')
  })

  void it('groups the digits by three with a space', () => {
    assert.equal(formatCount(9812), '9 812')
    assert.equal(formatCount(12_348), '12 348')
    assert.equal(formatCount(1_234_567), '1 234 567')
  })

  void it('keeps a negative sign', () => {
    assert.equal(formatCount(-1234), '-1 234')
  })

  void it('drops the fraction of a count', () => {
    assert.equal(formatCount(1234.7), '1 234')
  })
})

void describe('formatSize', () => {
  void it('writes the two sides of a widget with a multiplication sign', () => {
    assert.equal(formatSize(354, 200), '354 × 200')
  })

  void it('rounds the sides to whole pixels', () => {
    assert.equal(formatSize(354.4, 199.6), '354 × 200')
    assert.equal(formatSize(0, 0), '0 × 0')
  })
})
