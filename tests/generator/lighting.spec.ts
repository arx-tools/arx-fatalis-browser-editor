import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, type ArxColor, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import { Mesh, MeshBasicMaterial, PlaneGeometry } from 'three'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { bakedCornersOf, cornersWithin } from '../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
import { bakeLlfColors, bakeLlfColorsAt, type LightingOptions } from '../../src/generator/lighting.ts'
import { Settings } from '../../src/generator/Settings.ts'

/**
 * A light of the test.
 *
 * @param position Where the light stands, in the frame of the scene.
 * @param options The color, the intensity, the radii and the flags of the light.
 * @param options.color The RGB the light shines with.
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
 * A level of one floor tile, with a palette of four white colors.
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

  void it('fills every corner with the gray of the flat light', () => {
    const colors = bakeFloor({ flatLuminosity: 0.5 }, 'Flat')

    assert.ok(
      colors.every((color) => {
        return color.r === 128 && color.g === 128 && color.b === 128 && color.a === 255
      }),
    )
  })

  void it('draws the flat light from dark to the brightest', () => {
    const dark = bakeFloor({ flatLuminosity: 0 }, 'Flat')
    const bright = bakeFloor({ flatLuminosity: 1 }, 'Flat')

    assert.equal(dark[0]?.r, 0)
    assert.equal(bright[0]?.r, 255)
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

  void it('takes the value of the colors from the luminosity of the rainbow', () => {
    const dark = bakeFloor({ rainbowLuminosity: 0 }, 'TextureRainbow')
    const half = bakeFloor({ rainbowLuminosity: 0.5 }, 'TextureRainbow')
    const full = bakeFloor({ rainbowLuminosity: 1 }, 'TextureRainbow')

    assert.deepEqual(dark[0], { r: 0, g: 0, b: 0, a: 255 })
    // the only container is the first one, red, at the saturation of the profile: the slider is the value of the color
    assert.deepEqual(half[0], { r: 128, g: 32, b: 32, a: 255 })
    assert.deepEqual(full[0], { r: 255, g: 64, b: 64, a: 255 })
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

/**
 * The scene position of the blank floor the tests bake: the vertices and the lights are shifted by it.
 */
const SCENE = { x: 50, y: 0, z: 50 } as const

/**
 * A corner of the blank floor, as a game position.
 */
type Corner = {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * What a light above a corner of the blank floor can say.
 */
type AboveOptions = {
  /**
   * The color of the light.
   */
  readonly color?: ArxColor
  /**
   * How far the light reaches, in the units of the level.
   */
  readonly fallEnd?: number
}

/**
 * A light above one corner of the blank floor.
 *
 * @remarks
 * The bake shifts a vertex into the scene by `-vertex + scenePosition`, and the light by `arxVector3toVector3`
 * (`(-x, -y, z)`) with no shift: a light that stands in the scene above a corner is the game position of the corner
 * minus the scene position of the level, with the height of the light on the mirrored `y` (the scene's `y` is up).
 *
 * @param corner Which corner of the floor.
 * @param options The color of the light and how far it reaches.
 *
 * @returns The light, 20 units above the corner.
 */
function lightAbove(corner: Corner, options: AboveOptions = {}): ArxLight {
  return lightOf(
    { x: corner.x - SCENE.x, y: -20, z: corner.z - SCENE.z },
    { fallEnd: options.fallEnd ?? 30, color: options.color, fallStart: 0 },
  )
}

/**
 * The corners of a level the spheres of the lights reach.
 *
 * @param map The level to read.
 * @param lights The lights of the edit: the states before and after it.
 *
 * @returns The entries of the corner index the spheres reach, in the order of the geometry.
 *
 * @throws When the level has no corner index.
 */
function reachedBy(map: ArxMap, lights: readonly ArxLight[]): number[] {
  const corners = bakedCornersOf(map)

  if (corners === undefined) {
    throw new TypeError('the level has no corner index')
  }

  return cornersWithin(
    corners,
    lights.map((light) => {
      // the bake mirrors the place of the light, the way the mesh is mirrored
      return { x: -light.position.x, y: -light.position.y, z: light.position.z, radius: light.fallEnd }
    }),
  )
}

/**
 * The spots of the corners of a level, as the partial bake reads them.
 *
 * @param map The level to read.
 *
 * @returns The corners of the level.
 *
 * @throws When the level has no corner index.
 */
function spotsOf(map: ArxMap): NonNullable<ReturnType<typeof bakedCornersOf>> {
  const corners = bakedCornersOf(map)

  if (corners === undefined) {
    throw new TypeError('the level has no corner index')
  }

  return corners
}

void describe('bakeLlfColorsAt', () => {
  void it('bakes the corners the light left and the corners it reaches now', () => {
    const before = lightAbove({ x: 0, y: 0, z: 0 })
    const after = lightAbove({ x: 100, y: 0, z: 100 }, { color: { r: 0, g: 0, b: 255, a: 255 } })
    const moved = litFloor()

    // the palette of the level before the edit: the light over the first corner
    moved.llf.lights = [before]
    moved.llf.colors = bakeLlfColors(moved.fts, moved.llf, { mode: 'Arx' })

    // the edit moves the light to the last corner
    moved.llf.lights = [after]

    const around = bakeLlfColorsAt(moved.llf, { mode: 'Arx' }, spotsOf(moved), reachedBy(moved, [before, after]))

    // the two spheres mark the two corners: the one the light gives back and the one it reaches now
    assert.deepEqual(around.keys().toArray(), [0, 3])

    // the corner the light left goes back to the ambient floor
    assert.deepEqual(around.get(0), { r: 23, g: 23, b: 23, a: 255 })

    // the corner it reaches now takes the color the full bake of the same lights gives it
    const reference = litFloor()

    reference.llf.lights = [after]
    reference.llf.colors = bakeLlfColors(reference.fts, reference.llf, { mode: 'Arx' })

    assert.deepEqual(around.get(3), reference.llf.colors[3])
  })

  void it('bakes from every light of the level, not only the one that changed', () => {
    const map = litFloor()
    const one = lightAbove({ x: 0, y: 0, z: 0 }, { fallEnd: 300 })
    const other = lightAbove({ x: 100, y: 0, z: 100 }, { fallEnd: 300 })
    const changed = lightAbove({ x: 0, y: 0, z: 0 }, { fallEnd: 300, color: { r: 0, g: 0, b: 255, a: 255 } })

    // both lights reach both of their corners, so the edit of one of them has to bake the other one in too
    map.llf.lights = [changed, other]

    const reached = reachedBy(map, [one, changed])
    const around = bakeLlfColorsAt(map.llf, { mode: 'Arx' }, spotsOf(map), reached)

    map.llf.colors = bakeLlfColors(map.fts, map.llf, { mode: 'Arx' })

    const same = [...around].map(([index, color]) => {
      return [index, color, map.llf.colors[index]]
    })

    assert.deepEqual(
      same.filter(([, color, expected]) => {
        return JSON.stringify(color) !== JSON.stringify(expected)
      }),
      [],
    )
    // the two wide spheres reach the four corners of the floor
    assert.deepEqual(around.keys().toArray(), [0, 1, 2, 3])
  })

  void it('leaves the corners the light does not reach out', () => {
    const map = litFloor()
    // a light over the first corner, and another one over the last one: the other two corners are out of their reach
    const one = lightAbove({ x: 0, y: 0, z: 0 })
    const other = lightAbove({ x: 100, y: 0, z: 100 })

    map.llf.lights = [one, other]

    const around = bakeLlfColorsAt(map.llf, { mode: 'Arx' }, spotsOf(map), reachedBy(map, [one, other]))

    assert.deepEqual(around.keys().toArray(), [0, 3])
  })

  void it('gives the corners of a semidynamic light back when the light stops baking', () => {
    const map = litFloor()
    const burning = lightAbove({ x: 0, y: 0, z: 0 })
    const semidynamic = lightAbove({ x: 0, y: 0, z: 0 }, {})
    semidynamic.flags = ArxLightFlags.SemiDynamic

    map.llf.lights = [semidynamic]

    const around = bakeLlfColorsAt(map.llf, { mode: 'Arx' }, spotsOf(map), reachedBy(map, [burning]))

    // the light is out of the palette now, so the corner it used to light goes back to the ambient floor
    assert.deepEqual(around.get(0), { r: 23, g: 23, b: 23, a: 255 })
  })

  void it('bakes nothing in the modes that do not read the lights', () => {
    const map = litFloor()
    const light = lightAbove({ x: 0, y: 0, z: 0 })

    map.llf.lights = [light]

    const modes = ['Flat', 'MaxBrightness', 'CompleteDarkness', 'TextureRainbow'] as const
    const sizes = modes.map((mode) => {
      return bakeLlfColorsAt(map.llf, { mode }, spotsOf(map), reachedBy(map, [light])).size
    })

    assert.deepEqual(sizes, [0, 0, 0, 0])
  })
})
