import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatCount } from '../../../src/editor/modules/format.ts'

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
