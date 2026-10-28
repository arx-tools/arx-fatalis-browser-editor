import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxVector3 } from 'arx-convert/types'
import { centreOfBounds, type CameraBounds } from '../../../../src/editor/components/widgets/cameraBounds.ts'

/**
 * The box the fixed views frame.
 */
const bounds: CameraBounds = {
  min: { x: -1000, y: -200, z: -500 },
  max: { x: 1000, y: 600, z: 1500 },
}

/**
 * The middle of {@link bounds}.
 */
const centre: ArxVector3 = { x: 0, y: 200, z: 500 }

void describe('centreOfBounds', () => {
  void it('is the middle of the box', () => {
    assert.deepEqual(centreOfBounds(bounds), centre)
  })

  void it('follows a box that is on one side of the origin', () => {
    const shifted: CameraBounds = {
      min: { x: 100, y: 200, z: 300 },
      max: { x: 300, y: 400, z: 700 },
    }

    assert.deepEqual(centreOfBounds(shifted), { x: 200, y: 300, z: 500 })
  })
})
