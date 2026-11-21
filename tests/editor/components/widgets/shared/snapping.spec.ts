import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  DEFAULT_ROTATION_SNAP_DEGREES,
  rotationSnapDegrees,
  rotationSnapFor,
} from '../../../../../src/editor/components/widgets/shared/snapping.ts'

void describe('rotationSnapFor', () => {
  afterEach(() => {
    rotationSnapDegrees.value = DEFAULT_ROTATION_SNAP_DEGREES
  })

  void it('uses the setting when Shift is not held', () => {
    rotationSnapDegrees.value = 15

    assert.equal(rotationSnapFor(false), 15)
  })

  void it('uses the coarse 45 degrees while Shift is held, whatever the setting', () => {
    rotationSnapDegrees.value = 10

    assert.equal(rotationSnapFor(false), 10)
    assert.equal(rotationSnapFor(true), 45)
  })
})
