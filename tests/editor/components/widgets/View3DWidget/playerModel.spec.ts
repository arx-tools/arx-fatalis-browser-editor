import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Box3, Vector3 } from 'three'
import {
  firstPersonVolumeOf,
  insideFirstPersonVolume,
  type FirstPersonVolume,
} from '../../../../../src/editor/components/widgets/View3DWidget/playerModel.ts'

/**
 * The feet of a player model, at the origin of the world.
 */
const FEET = new Vector3(0, 0, 0)

/**
 * The part of the player the game hides, as the `human_base` model has it: the head and the chest, above the waist.
 */
const VOLUME: FirstPersonVolume = { radius: 20, bottom: 92, top: 180 }

void describe('firstPersonVolumeOf', () => {
  void it('reads the radius of the box, whichever side is the wider', () => {
    const volume = firstPersonVolumeOf(new Box3(new Vector3(-18, 92, -12), new Vector3(17, 180, 20)))

    assert.deepEqual(volume, { radius: 20, bottom: 92, top: 180 })
  })

  void it('gives no volume when the selection has no vertices', () => {
    assert.equal(firstPersonVolumeOf(new Box3()), undefined)
  })
})

void describe('insideFirstPersonVolume', () => {
  void it('counts the camera at the eyes as inside the body', () => {
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 170, 0), false), true)
  })

  void it('counts the camera in front of the body as outside', () => {
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 170, 30), false), false)
  })

  void it('counts the camera at the legs as outside, because the game hides the upper body only', () => {
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 50, 0), false), false)
  })

  void it('counts the camera above the head as outside', () => {
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 200, 0), false), false)
  })

  void it('keeps the variant on the way out, and waits for the margin', () => {
    // the radius is 20: the way in is the body itself, the way out waits until the camera is 12 units out of it
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 170, 28), false), false)
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 170, 28), true), true)
    assert.equal(insideFirstPersonVolume(VOLUME, FEET, new Vector3(0, 170, 33), true), false)
  })

  void it('follows the feet of the model, not the origin of the world', () => {
    const feet = new Vector3(100, 0, 200)

    assert.equal(insideFirstPersonVolume(VOLUME, feet, new Vector3(100, 170, 200), false), true)
    assert.equal(insideFirstPersonVolume(VOLUME, feet, new Vector3(0, 170, 0), false), false)
  })
})
