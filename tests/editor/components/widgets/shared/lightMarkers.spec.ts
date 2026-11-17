import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Sprite, Texture } from 'three'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import {
  createLightMarkers,
  disposeLightMarkers,
  lightMarkerColorOf,
  lightMarkerShapeOf,
  lightMarkerSizeOf,
  updateLightMarkers,
  type LightMarkerTextures,
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

/**
 * Makes the textures of the markers without a canvas: the tests read which one a sprite takes.
 *
 * @returns A texture for every shape.
 */
function texturesOf(): LightMarkerTextures {
  const textures: LightMarkerTextures = {
    star: new Texture(),
    bulb: new Texture(),
    flame: new Texture(),
    flameCrossed: new Texture(),
  }

  for (const [shape, texture] of Object.entries(textures)) {
    texture.name = shape
  }

  return textures
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

void describe('lightMarkerShapeOf', () => {
  void it('leaves the sparkle of a static light', () => {
    assert.equal(lightMarkerShapeOf(light()), 'star')
  })

  void it('draws a bulb for a semi-dynamic light', () => {
    assert.equal(lightMarkerShapeOf(light({ flags: ArxLightFlags.SemiDynamic })), 'bulb')
  })

  void it('draws a flame for a light that burns or can be doused', () => {
    assert.equal(lightMarkerShapeOf(light({ flags: ArxLightFlags.Extinguishable })), 'flame')
    assert.equal(lightMarkerShapeOf(light({ flags: ArxLightFlags.SpawnFire })), 'flame')
  })

  void it('lets the flame win over the bulb of the same light', () => {
    assert.equal(
      lightMarkerShapeOf(light({ flags: ArxLightFlags.SemiDynamic | ArxLightFlags.Extinguishable })),
      'flame',
    )
  })

  void it('draws the crossed out flame for a light that starts extinguished', () => {
    assert.equal(
      lightMarkerShapeOf(light({ flags: ArxLightFlags.SemiDynamic | ArxLightFlags.StartExtinguished })),
      'flameCrossed',
    )
  })

  void it('keeps the sparkle of a light whose only flag is the smoke', () => {
    assert.equal(lightMarkerShapeOf(light({ flags: ArxLightFlags.SpawnSmoke })), 'star')
  })
})

void describe('createLightMarkers', () => {
  void it('builds one sprite per light, with the shape of its flags, at the place of the light', () => {
    const textures = texturesOf()
    const group = createLightMarkers(
      [light(), light({ position: { x: -1, y: -2, z: -3 }, flags: ArxLightFlags.SemiDynamic })],
      textures,
    )

    assert.equal(group.children.length, 2)

    const first = group.children.at(0)

    assert.ok(first instanceof Sprite)
    // the mesh space turns the x and y of the game, the way every vertex of the level is turned
    assert.deepEqual(first.position.toArray(), [-10, -20, 30])
    assert.deepEqual(first.scale.toArray(), [20, 20, 1])
    assert.equal(first.material.map, textures.star)

    const second = group.children.at(1)

    assert.ok(second instanceof Sprite)
    assert.deepEqual(second.position.toArray(), [1, 2, -3])
    assert.equal(second.material.map, textures.bulb)

    disposeLightMarkers(group)
    assert.equal(group.children.length, 0)
  })
})

void describe('updateLightMarkers', () => {
  void it('takes the new shape, colour, size and place of an edited light', () => {
    const textures = texturesOf()
    const group = createLightMarkers([light()], textures)
    const sprite = group.children.at(0)

    assert.ok(sprite instanceof Sprite)

    const edited = light({
      position: { x: -4, y: 5, z: -6 },
      color: { r: 0, g: 0, b: 255, a: 1 },
      fallStart: 50,
      flags: ArxLightFlags.SemiDynamic | ArxLightFlags.Extinguishable,
    })

    updateLightMarkers(group, [edited], textures)

    assert.equal(group.children.length, 1)
    assert.equal(sprite.material.map, textures.flame)
    assert.ok(sprite.material.color.equals(lightMarkerColorOf(edited)))
    assert.deepEqual(sprite.scale.toArray(), [10, 10, 1])
    assert.deepEqual(sprite.position.toArray(), [4, -5, -6])
  })

  void it('rebuilds the group when the number of lights changes', () => {
    const textures = texturesOf()
    const group = createLightMarkers([light()], textures)

    updateLightMarkers(group, [light(), light({ flags: ArxLightFlags.StartExtinguished })], textures)

    assert.equal(group.children.length, 2)

    const second = group.children.at(1)

    assert.ok(second instanceof Sprite)
    assert.equal(second.material.map, textures.flameCrossed)
  })
})
