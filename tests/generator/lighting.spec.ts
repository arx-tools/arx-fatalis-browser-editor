import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, type ArxColor, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { bakeLlfColors, type LightingOptions } from '../../src/generator/lighting.ts'
import { Settings } from '../../src/generator/Settings.ts'

/**
 * A light of the test.
 *
 * @param position Where the light stands, in the frame of the scene.
 * @param options The colour, the intensity, the radii and the flags of the light.
 * @param options.color The colour of the light.
 * @param options.intensity How bright it is.
 * @param options.fallStart The radius of the full light.
 * @param options.fallEnd The radius where the light ends.
 * @param options.flags The bits that mark it (semidynamic, fire, smoke).
 *
 * @returns The light, with the fields an LLF light has.
 */
function lightOf(
  position: ArxVector3,
  options: { color?: ArxColor; intensity?: number; fallStart?: number; fallEnd?: number; flags?: number } = {},
): ArxLight {
  return {
    position,
    color: options.color ?? { r: 255, g: 255, b: 255, a: 255 },
    fallStart: options.fallStart ?? 0,
    fallEnd: options.fallEnd ?? 1000,
    intensity: options.intensity ?? 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: options.flags ?? ArxLightFlags.None,
  }
}

/**
 * A level of one floor tile, with a palette of four white colours.
 *
 * @remarks
 * The scene position of the blank level is `(50, 0, 50)`, so the corners of the tile sit in the scene around the
 * origin, and a light above the middle of the tile is at the scene `(0, 200, 0)`: the game's Y points down, so the
 * scene's Y points up.
 *
 * @returns The map, ready to bake.
 *
 * @throws When the blank level has no face.
 */
function litFloor(): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const colors: ArxColor[] = Array.from({ length: 4 }, () => {
    return { r: 255, g: 255, b: 255, a: 255 }
  })
  const polygon = map.polygons[0]

  if (polygon === undefined) {
    throw new Error('the blank level has no face')
  }

  map.llf.colors = colors

  for (const [index, vertex] of polygon.vertices.entries()) {
    vertex.llfColorIdx = index
  }

  return map
}

/**
 * Bakes the palette of the floor with a light above it.
 *
 * @param options The options of the bake, below the mode.
 * @param mode The profile of the bake.
 * @param light The light to put above the floor.
 *
 * @returns The baked palette.
 */
function bakeFloor(
  options: Omit<LightingOptions, 'mode'> = {},
  mode: LightingOptions['mode'] = 'Arx',
  light: ArxLight = lightOf({ x: 0, y: -200, z: 0 }),
): ArxColor[] {
  const map = litFloor()

  map.llf.lights = [light]

  return bakeLlfColors(map.fts, map.llf, { ...options, mode })
}

void describe('bakeLlfColors', () => {
  void it('gives every corner white in the MaxBrightness mode', () => {
    const colors = bakeFloor({}, 'MaxBrightness')

    assert.deepEqual(colors, [
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ])
  })

  void it('gives every corner black in the CompleteDarkness mode', () => {
    const colors = bakeFloor({}, 'CompleteDarkness')

    assert.deepEqual(colors, [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
    ])
  })

  void it('takes a hue from the texture container in the TextureRainbow mode', () => {
    const colors = bakeFloor({}, 'TextureRainbow')

    assert.equal(colors.length, 4)
    // the only container is the first one: red, with the saturation of the mode
    assert.ok(
      colors.every((color) => {
        return color.r > color.g && color.r > color.b
      }),
    )
  })

  void it('bakes the static light into the corners in the Arx mode', () => {
    const colors = bakeFloor({}, 'Arx')

    // the light is above the middle: the corners see it at about 0.94 of the angle, with the 0.85 of the mode
    assert.ok(
      colors.every((color) => {
        return color.r > 150 && color.r < 240
      }),
    )
    assert.ok(
      colors.every((color) => {
        return color.g === color.r && color.b === color.r
      }),
    )
  })

  void it('keeps the palette above the ambient floor when no light reaches it', () => {
    const colors = bakeFloor({}, 'Arx', lightOf({ x: 0, y: -200, z: 0 }, { fallEnd: 50 }))

    assert.deepEqual(colors, [
      { r: 23, g: 23, b: 23, a: 255 },
      { r: 23, g: 23, b: 23, a: 255 },
      { r: 23, g: 23, b: 23, a: 255 },
      { r: 23, g: 23, b: 23, a: 255 },
    ])
  })

  void it('leaves a semidynamic light out of both profiles', () => {
    const semidynamic = lightOf({ x: 0, y: -200, z: 0 }, { flags: ArxLightFlags.SemiDynamic })
    const arx = bakeFloor({}, 'Arx', semidynamic)
    const realistic = bakeFloor({ ambientFloor: 23 }, 'Realistic', semidynamic)

    // a torch is lit by the game at runtime: the palette keeps it out, and the realistic profile does not double it
    assert.ok(
      arx.every((color) => {
        return color.r === 23
      }),
    )
    assert.ok(
      realistic.every((color) => {
        return color.r === 23
      }),
    )
  })

  void it('bakes a brighter corner in the Realistic mode than in the Arx one', () => {
    const arx = bakeFloor({}, 'Arx')
    const realistic = bakeFloor({ ambientFloor: 0 }, 'Realistic')

    assert.ok((realistic[0]?.r ?? 0) > (arx[0]?.r ?? 0))
  })

  void it('keeps the ambient floor of the Realistic mode on a shadowed corner', () => {
    const blocker = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial())

    blocker.rotation.x = -Math.PI / 2
    blocker.position.set(0, 100, 0)
    blocker.updateMatrixWorld()

    const shadowed = bakeFloor({ ambientFloor: 23, occluders: [blocker], shadows: true }, 'Realistic')
    const unshadowed = bakeFloor({ ambientFloor: 23, occluders: [blocker], shadows: false }, 'Realistic')

    assert.ok(
      shadowed.every((color) => {
        return color.r === 23
      }),
    )
    assert.ok(
      unshadowed.every((color) => {
        return color.r > 150
      }),
    )
  })
})
