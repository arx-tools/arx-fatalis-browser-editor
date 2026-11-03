import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isPickDue, PICK_INTERVAL_MS } from '../../../../../src/editor/components/widgets/View3DWidget/pickInterval.ts'

void describe('isPickDue', () => {
  void it('lets the first pick run', () => {
    assert.equal(isPickDue(1000, 0), true)
  })

  void it('holds the pick back inside the interval', () => {
    assert.equal(isPickDue(1000 + PICK_INTERVAL_MS - 1, 1000), false)
  })

  void it('lets the pick run again on the interval', () => {
    assert.equal(isPickDue(1000 + PICK_INTERVAL_MS, 1000), true)
    assert.equal(isPickDue(1000 + PICK_INTERVAL_MS + 1, 1000), true)
  })

  void it('takes the interval of the caller', () => {
    assert.equal(isPickDue(1010, 1000, 10), true)
    assert.equal(isPickDue(1009, 1000, 10), false)
  })
})
