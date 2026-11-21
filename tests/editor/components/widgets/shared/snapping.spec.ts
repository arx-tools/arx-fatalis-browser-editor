import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  DEFAULT_ROTATION_SNAP_DEGREES,
  nearestSnapPair,
  rotationSnapDegrees,
  rotationSnapFor,
  snapAxesOf,
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

void describe('snapAxesOf', () => {
  void it('reads the axes of a handle', () => {
    assert.deepEqual(snapAxesOf('X'), ['x'])
    assert.deepEqual(snapAxesOf('yz'), ['y', 'z'])
    assert.deepEqual(snapAxesOf('XZ'), ['x', 'z'])
  })

  void it('gives no axis to the screen-space handle', () => {
    assert.deepEqual(snapAxesOf(undefined), [])
    assert.deepEqual(snapAxesOf('E'), [])
  })
})

void describe('nearestSnapPair', () => {
  void it('takes the closest corner-to-vertex pair within the threshold', () => {
    const pair = nearestSnapPair(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
      ],
      [
        { x: 5, y: 0 },
        { x: 42, y: 0 },
      ],
    )

    assert.deepEqual(pair, { corner: 1, target: 1, distance: 2 })
  })

  void it('gives nothing when every pair is farther than the threshold', () => {
    const pair = nearestSnapPair([{ x: 0, y: 0 }], [{ x: 20, y: 0 }], 12)

    assert.equal(pair, undefined)
  })
})
