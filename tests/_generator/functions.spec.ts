import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { percentOf } from '../../src/_generator/functions.ts'

void describe('percentOf', () => {
  void it('scales a value by a percentage', () => {
    assert.equal(percentOf(200, 50), 100)
    assert.equal(percentOf(200, 0), 0)
    assert.equal(percentOf(200, 100), 200)
    assert.equal(percentOf(256, 25), 64)
    assert.equal(percentOf(0, 50), 0)
  })
})
