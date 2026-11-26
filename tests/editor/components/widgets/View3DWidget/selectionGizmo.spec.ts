import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Quaternion, Vector3 } from 'three'
import {
  steeredScaleOf,
  turnAxisAngleOf,
} from '../../../../../src/editor/components/widgets/View3DWidget/selectionGizmo.ts'
import { MIN_SCALE_FACTOR } from '../../../../../src/generator/ArxMap.ts'

/**
 * Reads an angle of degrees in radians.
 *
 * @param degrees The angle in degrees.
 *
 * @returns The angle in radians.
 */
function radiansOf(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Builds a turn around an axis.
 *
 * @param axis What it turns around.
 * @param degrees How far it turns, in degrees.
 *
 * @returns The turn, as the rotation of the gizmo carries it.
 */
function turnOf(axis: Vector3, degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, radiansOf(degrees))
}

void describe('turnAxisAngleOf', () => {
  void it('reads the axis and the angle of a turn', () => {
    const turn = turnAxisAngleOf(turnOf(new Vector3(0, 1, 0), 90))

    assert.ok(Math.abs(turn.angle - radiansOf(90)) < 1e-9)
    assert.ok(Math.abs(turn.axis.x) < 1e-9)
    assert.ok(Math.abs(turn.axis.y - 1) < 1e-9)
    assert.ok(Math.abs(turn.axis.z) < 1e-9)
  })

  void it('takes the shorter way around', () => {
    // 200 degrees around Z is 160 degrees around -Z
    const turn = turnAxisAngleOf(turnOf(new Vector3(0, 0, 1), 200))

    assert.ok(Math.abs(turn.angle - radiansOf(160)) < 1e-9)
    assert.ok(Math.abs(turn.axis.z + 1) < 1e-9)
  })

  void it('reads a turn the other way as the positive one around the other axis', () => {
    const turn = turnAxisAngleOf(turnOf(new Vector3(0, 1, 0), -90))

    assert.ok(Math.abs(turn.angle - radiansOf(90)) < 1e-9)
    assert.ok(Math.abs(turn.axis.y + 1) < 1e-9)
  })

  void it('gives no angle for no turn', () => {
    const turn = turnAxisAngleOf(new Quaternion())

    assert.equal(turn.angle, 0)
  })
})

void describe('steeredScaleOf', () => {
  void it('hands over the factor of an arrow as it is', () => {
    assert.deepEqual(steeredScaleOf({ x: 2, y: 2, z: 2 }, false), { x: 2, y: 2, z: 2 })
  })

  void it('takes an eighth of the ratio of the center handle, so the same drag steers', () => {
    // five times the distance of the press is a half more of the selection, not a jump to five
    assert.deepEqual(steeredScaleOf({ x: 5, y: 5, z: 5 }, true), { x: 1.5, y: 1.5, z: 1.5 })
    assert.deepEqual(steeredScaleOf({ x: 9, y: 9, z: 9 }, true), { x: 2, y: 2, z: 2 })
  })

  void it('keeps the selection away from zero, whichever handle the drag takes', () => {
    assert.deepEqual(steeredScaleOf({ x: 0, y: 0, z: 0 }, false), {
      x: MIN_SCALE_FACTOR,
      y: MIN_SCALE_FACTOR,
      z: MIN_SCALE_FACTOR,
    })
    assert.deepEqual(steeredScaleOf({ x: -20, y: -20, z: -20 }, true), {
      x: MIN_SCALE_FACTOR,
      y: MIN_SCALE_FACTOR,
      z: MIN_SCALE_FACTOR,
    })
  })
})
