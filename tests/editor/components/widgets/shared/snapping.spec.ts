import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  DEFAULT_ROTATION_SNAP_DEGREES,
  nearestSnapPair,
  rotationSnapDegrees,
  rotationSnapFor,
  snapAxesOf,
  snapModifierOfEvent,
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

void describe('snapModifierOfEvent', () => {
  void it('follows the Shift of the window', () => {
    assert.equal(snapModifierOfEvent({ tagName: 'DIV' }, true), true)
    assert.equal(snapModifierOfEvent({ tagName: 'DIV' }, false), false)
    assert.equal(snapModifierOfEvent(null, true), true)
  })

  void it('lets the key go while a text field has the focus', () => {
    assert.equal(snapModifierOfEvent({ tagName: 'INPUT' }, true), false)
    assert.equal(snapModifierOfEvent({ tagName: 'TEXTAREA' }, true), false)
    assert.equal(snapModifierOfEvent({ tagName: 'SELECT' }, true), false)
    assert.equal(snapModifierOfEvent({ isContentEditable: true }, true), false)
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
