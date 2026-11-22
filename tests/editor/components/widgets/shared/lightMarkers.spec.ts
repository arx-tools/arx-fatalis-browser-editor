import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { PerspectiveCamera, Sprite, Texture } from 'three'
import { ArxLightFlags, type ArxLight } from 'arx-convert/types'
import {
  isDynamicLightsVisible,
  isStaticLightsVisible,
} from '../../../../../src/editor/modules/level/edit/dynamicLights.ts'
import { lightingProfile } from '../../../../../src/editor/modules/level/edit/lightingProfile.ts'
import {
  createLightMarkers,
  disposeLightMarkers,
  isLightDisabled,
  isLightHidden,
  lightMarkerColorOf,
  lightMarkerShapeOf,
  lightMarkerIndexAt,
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

beforeEach(() => {
  isStaticLightsVisible.value = true
  isDynamicLightsVisible.value = false
  lightingProfile.value = 'Arx'
})

void describe('isLightDisabled', () => {
  void it('leaves a static light on while the static switch is on', () => {
    assert.equal(isLightDisabled(light()), false)
  })

  void it('disables a static light with the static switch off', () => {
    isStaticLightsVisible.value = false

    assert.equal(isLightDisabled(light()), true)
  })

  void it('leaves a semi-dynamic light on while the dynamic switch is on', () => {
    isDynamicLightsVisible.value = true

    assert.equal(isLightDisabled(light({ flags: ArxLightFlags.SemiDynamic })), false)
  })

  void it('disables a semi-dynamic light with the dynamic switch off', () => {
    assert.equal(isLightDisabled(light({ flags: ArxLightFlags.SemiDynamic })), true)
  })
})

void describe('isLightHidden', () => {
  void it('hides the static lights of the profiles with a light of their own', () => {
    lightingProfile.value = 'Flat'

    assert.equal(isLightHidden(light()), true)
    // the dynamic layer still draws the torches: their marker stays
    assert.equal(isLightHidden(light({ flags: ArxLightFlags.SemiDynamic })), false)

    lightingProfile.value = 'TextureRainbow'

    assert.equal(isLightHidden(light()), true)
    assert.equal(isLightHidden(light({ flags: ArxLightFlags.SemiDynamic })), false)
  })

  void it('keeps the static lights of the profiles that read them', () => {
    assert.equal(isLightHidden(light()), false)

    lightingProfile.value = 'Realistic'

    assert.equal(isLightHidden(light()), false)
  })
})

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
    assert.equal(first.userData.lightIndex, 0)
    assert.equal(first.renderOrder, 10)

    const second = group.children.at(1)

    assert.ok(second instanceof Sprite)
    assert.deepEqual(second.position.toArray(), [1, 2, -3])
    assert.equal(second.material.map, textures.bulb)
    assert.equal(second.userData.lightIndex, 1)

    disposeLightMarkers(group)
    assert.equal(group.children.length, 0)
  })

  void it('draws the marker of a switched off layer grey and see-through', () => {
    const textures = texturesOf()
    const group = createLightMarkers([light({ flags: ArxLightFlags.SemiDynamic })], textures)
    const sprite = group.children.at(0)

    assert.ok(sprite instanceof Sprite)
    assert.equal(sprite.material.opacity, 0.3)
    assert.ok(sprite.material.color.r < 1)

    isDynamicLightsVisible.value = true

    updateLightMarkers(group, [light({ flags: ArxLightFlags.SemiDynamic })], textures)

    const expected = lightMarkerColorOf(light({ flags: ArxLightFlags.SemiDynamic }))

    assert.equal(sprite.material.opacity, 1)
    assert.ok(sprite.material.color.equals(expected))
  })
})

void describe('the markers of the profiles with a light of their own', () => {
  void it('takes the sprites of the static lights off the frame', () => {
    lightingProfile.value = 'Flat'

    const group = createLightMarkers([light(), light({ flags: ArxLightFlags.SemiDynamic })], texturesOf())
    // the sprites are in the order of the lights
    const [staticLight, torch] = group.children

    assert.equal(staticLight?.visible, false)
    assert.equal(torch?.visible, true)

    disposeLightMarkers(group)
  })

  void it('follows a profile change when the markers are updated', () => {
    const lights = [light()]
    const group = createLightMarkers(lights, texturesOf())
    const [marker] = group.children

    assert.equal(marker?.visible, true)

    lightingProfile.value = 'TextureRainbow'

    updateLightMarkers(group, lights, texturesOf())

    assert.equal(marker?.visible, false)

    disposeLightMarkers(group)
  })
})

void describe('lightMarkerIndexAt', () => {
  void it('reads the light of the marker under the crosshair', () => {
    const textures = texturesOf()
    const group = createLightMarkers([light({ position: { x: 0, y: 0, z: 0 } })], textures)
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(lightMarkerIndexAt(camera, group), 0)
  })

  void it('reads nothing when the crosshair points away from the marker', () => {
    const textures = texturesOf()
    const group = createLightMarkers([light({ position: { x: 0, y: 50, z: 0 } })], textures)
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)

    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    group.updateMatrixWorld(true)

    assert.equal(lightMarkerIndexAt(camera, group), undefined)
  })
})

void describe('updateLightMarkers', () => {
  void it('takes the new shape, colour, size and place of an edited light', () => {
    isDynamicLightsVisible.value = true

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
