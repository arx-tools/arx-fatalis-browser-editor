import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Sprite, Texture } from 'three'
import type { ArxLight } from 'arx-convert/types'
import {
  createLightMarkers,
  disposeLightMarkers,
  lightMarkerColorOf,
  lightMarkerSizeOf,
} from '../../../../../src/editor/components/widgets/shared/lightMarkers.ts'

/**
 * Fills every field of an LLF light, so a test changes only what it needs.
 *
 * @param overrides The fields the test changes.
 *
 * @returns The LLF light, with the fields of the test.
 */
function light(overrides: Partial<ArxLight> = {}): ArxLight {
  return {
    position: { x: 10, y: 20, z: 30 },
    color: { r: 255, g: 128, b: 0, a: 1 },
    fallStart: 100,
    fallEnd: 200,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 1,
    exSize: 0.1,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
    ...overrides,
  }
}

void describe('lightMarkerSizeOf', () => {
  void it('takes its size from the fallStart of the light', () => {
    assert.equal(lightMarkerSizeOf(light({ fallStart: 100 })), 20)
    assert.equal(lightMarkerSizeOf(light({ fallStart: 400 })), 80)
  })

  void it('keeps a marker on a light without a falloff', () => {
    assert.equal(lightMarkerSizeOf(light({ fallStart: 0 })), 6)
  })
})

void describe('lightMarkerColorOf', () => {
  void it('takes the colour of the LLF light', () => {
    const color = lightMarkerColorOf(light())

    const green = 128 / 255

    assert.equal(color.r, 1)
    assert.ok(Math.abs(color.g - green) < 1e-9)
    assert.equal(color.b, 0)
  })
})

void describe('createLightMarkers', () => {
  void it('builds one sprite per light, at the place of the light', () => {
    const texture = new Texture()
    const group = createLightMarkers([light(), light({ position: { x: -1, y: -2, z: -3 } })], texture)

    assert.equal(group.children.length, 2)

    const first = group.children.at(0)

    assert.ok(first instanceof Sprite)
    // the mesh space turns the x and y of the game, the way every vertex of the level is turned
    assert.deepEqual(first.position.toArray(), [-10, -20, 30])
    assert.deepEqual(first.scale.toArray(), [20, 20, 1])
    assert.equal(first.material.map, texture)

    disposeLightMarkers(group)
    assert.equal(group.children.length, 0)
  })
})
