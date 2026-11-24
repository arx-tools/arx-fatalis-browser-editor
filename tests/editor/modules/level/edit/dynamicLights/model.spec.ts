import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxLightFlags, ArxPolygonFlags, type ArxColor, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import { BufferAttribute, BufferGeometry, Color, SRGBColorSpace } from 'three'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../../../../../src/editor/modules/level/blankLevel.ts'
import {
  applyDynamicLightModel,
  blackenDynamicLightModel,
  createDynamicLightModel,
  flickerColorOf,
  isBurningLight,
  isDynamicLightModelStale,
  refreshDynamicLightBaseColors,
  refreshDynamicLightLights,
  type DynamicLightModel,
} from '../../../../../../src/editor/modules/level/edit/dynamicLights/model.ts'
import { writeBakedColors } from '../../../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
import { setFlatLight } from '../../../../../../src/editor/modules/level/edit/lightingFlat.ts'
import { ArxMap } from '../../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../../src/generator/Settings.ts'

/**
 * The gray of the palette of the test floor.
 */
const FLOOR_GRAY = 128

/**
 * How far a corner of the blank floor is from a light 200 above its middle.
 *
 * @remarks
 * The corners of the minimal floor are 50 units from its middle on both horizontal axes, and the light stands 200 above
 * it: the cosine of the corner and the light is `200 / distance`, which is about 0.94.
 */
const CORNER_TO_LIGHT = Math.hypot(50, 200, 50)

/**
 * The weight of a torch of the test on a corner of the blank floor, with an intensity of one.
 */
const TORCH_WEIGHT = (200 / CORNER_TO_LIGHT) * 0.85 * 0.5

/**
 * A light of the test.
 *
 * @param position Where the light stands, in the scene of the level.
 * @param options The fields of the light.
 * @param options.color The RGB the light shines with.
 * @param options.intensity How bright it is.
 * @param options.fallStart The radius of the full light.
 * @param options.fallEnd The radius where the light ends.
 * @param options.exFlicker How much of the color the flicker may take away, channel by channel.
 * @param options.flags The bits that mark the light.
 *
 * @returns The light, with the fields an LLF light has.
 */
function lightOf(
  position: ArxVector3,
  options: {
    color?: ArxColor
    intensity?: number
    fallStart?: number
    fallEnd?: number
    exFlicker?: ArxColor
    flags?: number
  } = {},
): ArxLight {
  return {
    position,
    color: options.color ?? { r: 200, g: 200, b: 200, a: 255 },
    fallStart: options.fallStart ?? 300,
    fallEnd: options.fallEnd ?? 400,
    intensity: options.intensity ?? 1,
    exFlicker: options.exFlicker ?? { r: 0, g: 0, b: 0, a: 255 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: options.flags ?? ArxLightFlags.SemiDynamic,
  }
}

/**
 * A level of one floor tile, with a palette of four gray corners and its baked colors.
 *
 * @param options The palette and the flat light of the level.
 * @param options.gray The gray of the palette, from 0 to 255.
 * @param options.flat The light of the flat profile, when the level draws one gray.
 *
 * @returns The map, ready for the layer.
 *
 * @throws When the blank level has no face.
 */
function litFloor(options: { gray?: number; flat?: number } = {}): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const gray = options.gray ?? FLOOR_GRAY
  const colors: ArxColor[] = Array.from({ length: 4 }, () => {
    return { r: gray, g: gray, b: gray, a: 255 }
  })
  const polygon = map.polygons[0]

  if (polygon === undefined) {
    throw new Error('the blank level has no face')
  }

  map.llf.colors = colors
  map.llf.lights = []

  for (const [index, vertex] of polygon.vertices.entries()) {
    vertex.llfColorIdx = index
  }

  if (options.flat !== undefined) {
    setFlatLight(map, options.flat)
  }

  writeBakedColors(map)

  return map
}

/**
 * The model of a level, with the assertion that it was built.
 *
 * @param map The level to read.
 *
 * @returns The dynamic light model of the level.
 *
 * @throws When the level has no model.
 */
function modelOf(map: ArxMap): DynamicLightModel {
  const model = createDynamicLightModel(map)

  if (model === undefined) {
    throw new TypeError('the level has no dynamic light model')
  }

  return model
}

/**
 * The linear value of a gray, the way the attribute carries it.
 *
 * @param gray The gray in sRGB, from 0 to 255.
 *
 * @returns The channel in the working color space.
 */
function linearOf(gray: number): number {
  return new Color().setRGB(gray / 255, gray / 255, gray / 255, SRGBColorSpace).r
}

/**
 * One channel of a corner of the solid mesh.
 *
 * @param map The level to read.
 * @param vertex Which corner of the geometry.
 * @param channel Which channel of the color, from 0.
 *
 * @returns The value of the attribute.
 *
 * @throws When the level has no color attribute.
 */
function colorOf(map: ArxMap, vertex: number, channel: number): number {
  const attribute = map.solidMeshes[0]?.geometry.getAttribute('color')

  if (!(attribute instanceof BufferAttribute)) {
    throw new TypeError('the level has no color attribute')
  }

  const at = vertex * 3

  return attribute.array[at + channel]
}

/**
 * The geometry of the solid mesh of a level.
 *
 * @param map The level to read.
 *
 * @returns The solid geometry of the level.
 *
 * @throws When the level has no mesh.
 */
function geometryOf(map: ArxMap): BufferGeometry {
  const geometry = map.solidMeshes[0]?.geometry

  if (geometry === undefined) {
    throw new TypeError('the level has no mesh')
  }

  return geometry
}

/**
 * A random sequence the test decides.
 *
 * @param values The numbers to give, in order.
 *
 * @returns The random function, and how many times it was called.
 */
function randomOf(values: readonly number[]): { random: () => number; calls: () => number } {
  let calls = 0

  return {
    random: (): number => {
      const value = values[calls] ?? 0

      calls = calls + 1

      return value
    },
    calls: (): number => {
      return calls
    },
  }
}

void describe('isBurningLight', () => {
  void it('takes a semi-dynamic light that starts on', () => {
    assert.equal(isBurningLight(lightOf({ x: 0, y: 0, z: 0 })), true)
  })

  void it('leaves a semi-dynamic light that starts out', () => {
    const light = lightOf(
      { x: 0, y: 0, z: 0 },
      {
        flags: ArxLightFlags.SemiDynamic | ArxLightFlags.StartExtinguished,
      },
    )

    assert.equal(isBurningLight(light), false)
  })

  void it('leaves a static light', () => {
    assert.equal(isBurningLight(lightOf({ x: 0, y: 0, z: 0 }, { flags: ArxLightFlags.None })), false)
  })
})

void describe('flickerColorOf', () => {
  void it('keeps the color when the light has no flicker', () => {
    const { random } = randomOf([1, 1, 1])
    const color = flickerColorOf(lightOf({ x: 0, y: 0, z: 0 }), random)

    assert.deepEqual(color, { r: 200, g: 200, b: 200 })
  })

  void it('takes up to half of the color away, channel by channel', () => {
    const light = lightOf(
      { x: 0, y: 0, z: 0 },
      { color: { r: 100, g: 100, b: 100, a: 255 }, exFlicker: { r: 255, g: 255, b: 255, a: 255 } },
    )
    const { random } = randomOf([1, 1, 1])

    assert.deepEqual(flickerColorOf(light, random), { r: 50, g: 50, b: 50 })
  })

  void it('flickers the channels apart', () => {
    const light = lightOf(
      { x: 0, y: 0, z: 0 },
      { color: { r: 100, g: 100, b: 100, a: 255 }, exFlicker: { r: 255, g: 0, b: 0, a: 255 } },
    )
    const { random } = randomOf([1, 0, 0])

    assert.deepEqual(flickerColorOf(light, random), { r: 50, g: 100, b: 100 })
  })

  void it('asks the random once for every channel', () => {
    const { random, calls } = randomOf([0, 0, 0])

    flickerColorOf(lightOf({ x: 0, y: 0, z: 0 }), random)

    assert.equal(calls(), 3)
  })
})

void describe('createDynamicLightModel', () => {
  void it('gives every corner of the floor the light of a burning torch', () => {
    const map = litFloor()
    const light = lightOf({ x: 0, y: -200, z: 0 })

    map.llf.lights = [light]

    const model = modelOf(map)

    assert.equal(model.lights.length, 1)
    assert.equal(model.vertexCount, 6)
    assert.equal(model.vertices.length, 6)
    assert.equal(model.starts.length, 7)
    assert.deepEqual([...model.pairLights], [0, 0, 0, 0, 0, 0])

    // the light is inside fallStart, so the weight is the cosine of the corner, the intensity and the two factors
    const weights = [...model.pairWeights].filter((weight) => {
      return Math.abs(weight - TORCH_WEIGHT) >= 1e-6
    })

    assert.deepEqual(weights, [])
  })

  void it('fades the light between the two radii', () => {
    const map = litFloor()
    const light = lightOf({ x: 0, y: -350, z: 0 }, { fallStart: 100, fallEnd: 600 })

    map.llf.lights = [light]

    const model = modelOf(map)
    const distance = Math.hypot(50, 350, 50)
    const expected = (350 / distance) * ((600 - distance) / (600 - 100)) * 0.85 * 0.5
    const off = [...model.pairWeights].filter((weight) => {
      return Math.abs(weight - expected) >= 1e-6
    })

    assert.deepEqual(off, [])
  })

  void it('leaves a corner the light is on the other side of', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: 200, z: 0 })]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('reads the white of a corner without a palette entry', () => {
    const map = litFloor()
    const polygon = map.polygons[0]

    if (polygon === undefined) {
      throw new Error('the blank level has no face')
    }

    polygon.vertices[0].llfColorIdx = undefined
    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    assert.equal(model.paletteIndexes[0], -1)
    assert.equal(model.baseColors[0], 255)
  })

  void it('leaves a static light and a light that starts out off the layer', () => {
    const map = litFloor()

    map.llf.lights = [
      lightOf({ x: 0, y: -200, z: 0 }, { flags: ArxLightFlags.None }),
      lightOf(
        { x: 0, y: -200, z: 0 },
        {
          flags: ArxLightFlags.SemiDynamic | ArxLightFlags.StartExtinguished,
        },
      ),
    ]

    const model = modelOf(map)

    assert.equal(model.lights.length, 0)
    assert.equal(model.vertices.length, 0)
  })

  void it('skips a light without an intensity or a falloff', () => {
    const map = litFloor()

    map.llf.lights = [
      lightOf({ x: 0, y: -200, z: 0 }, { intensity: 0 }),
      lightOf({ x: 0, y: -200, z: 0 }, { fallEnd: 0 }),
      lightOf({ x: 0, y: -200, z: 0 }, { fallStart: 300, fallEnd: 300 }),
    ]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('skips a light that does not reach the floor', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 }, { fallStart: 10, fallEnd: 20 })]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('skips a corner the light stands in', () => {
    const map = litFloor()

    // one corner of the floor is at the scene (50, 0, 50): the light stands there, and the other corners are out of
    // its small falloff, so the two drawn corners of that place are the whole reach of the light
    map.llf.lights = [lightOf({ x: 50, y: 0, z: 50 }, { fallStart: 10, fallEnd: 20 })]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('groups two lights on the same corner', () => {
    const map = litFloor()

    map.llf.lights = [
      lightOf({ x: 0, y: -200, z: 0 }, { intensity: 1 }),
      lightOf({ x: 0, y: -300, z: 0 }, { intensity: 2, fallStart: 400, fallEnd: 500 }),
    ]

    const model = modelOf(map)

    assert.equal(model.vertices.length, 6)
    assert.equal(model.starts[1], 2)
    assert.deepEqual(
      [...model.pairLights].toSorted((one, other) => {
        return one - other
      }),
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    )
  })

  void it('leaves a blended face without light', () => {
    const map = litFloor()
    const polygon = map.polygons[0]

    if (polygon === undefined) {
      throw new Error('the blank level has no face')
    }

    polygon.flags = polygon.flags | ArxPolygonFlags.Transparent
    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('leaves the water without light', () => {
    const map = litFloor()
    const polygon = map.polygons[0]

    if (polygon === undefined) {
      throw new Error('the blank level has no face')
    }

    polygon.flags = polygon.flags | ArxPolygonFlags.Water
    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    assert.equal(modelOf(map).vertices.length, 0)
  })

  void it('follows the gray of the flat profile', () => {
    const map = litFloor({ flat: 0.5 })

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    assert.equal(model.baseColors[0], 127.5)
  })

  void it('gives no model without a solid mesh', () => {
    const map = { solidMeshes: [] } as unknown as ArxMap

    assert.equal(createDynamicLightModel(map), undefined)
  })

  void it('gives no model without a position or a normal attribute', () => {
    const map = litFloor()

    map.solidMeshes[0]?.geometry.deleteAttribute('normal')

    assert.equal(createDynamicLightModel(map), undefined)
  })

  void it('gives no model when the geometry does not hold the float positions', () => {
    const map = litFloor()
    const geometry = geometryOf(map)
    const position = geometry.getAttribute('position')

    geometry.setAttribute('position', new BufferAttribute(new Float64Array(position.array.length), 3))

    assert.equal(createDynamicLightModel(map), undefined)
  })

  void it('gives no model when the corners and the polygons do not line up', () => {
    const map = litFloor()
    const geometry = geometryOf(map)
    const { count } = geometry.getAttribute('position')

    geometry.setAttribute('position', new BufferAttribute(new Float32Array((count - 3) * 3), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array((count - 3) * 3), 3))

    assert.equal(createDynamicLightModel(map), undefined)
  })

  void it('gives no model when the geometry has more corners than the polygons', () => {
    const map = litFloor()
    const geometry = geometryOf(map)
    const { count } = geometry.getAttribute('position')

    geometry.setAttribute('position', new BufferAttribute(new Float32Array((count + 3) * 3), 3))
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array((count + 3) * 3), 3))

    assert.equal(createDynamicLightModel(map), undefined)
  })
})

void describe('applyDynamicLightModel', () => {
  void it('adds the light of the torch to the baked color', () => {
    const map = litFloor()
    const light = lightOf({ x: 0, y: -200, z: 0 }, { color: { r: 200, g: 200, b: 200, a: 255 } })

    map.llf.lights = [light]

    const model = modelOf(map)
    const { random } = randomOf([0, 0, 0])
    const applied = applyDynamicLightModel(model, geometryOf(map), random, true)

    assert.equal(applied, true)

    const torchLight = TORCH_WEIGHT * 200
    const expected = Math.round(FLOOR_GRAY + torchLight)
    const colors = Array.from({ length: 6 }, (_, vertex) => {
      return colorOf(map, vertex, 0)
    })
    const off = colors.filter((color) => {
      return Math.abs(color - linearOf(expected)) >= 1e-6
    })

    assert.deepEqual(off, [])
  })

  void it('clamps the light to white', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 }, { intensity: 8 })]

    const model = modelOf(map)

    applyDynamicLightModel(
      model,
      geometryOf(map),
      (): number => {
        return 0
      },
      true,
    )

    assert.ok(Math.abs(colorOf(map, 0, 0) - linearOf(255)) < 1e-6)
  })

  void it('draws the torch in the dark when the static light is off', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    applyDynamicLightModel(
      model,
      geometryOf(map),
      (): number => {
        return 0
      },
      false,
    )

    const torchLight = TORCH_WEIGHT * 200
    const expected = Math.round(torchLight)

    assert.ok(Math.abs(colorOf(map, 0, 0) - linearOf(expected)) < 1e-6)
  })

  void it('takes the flicker of the light away from the frame', () => {
    const map = litFloor()
    const light = lightOf(
      { x: 0, y: -200, z: 0 },
      {
        color: { r: 100, g: 100, b: 100, a: 255 },
        exFlicker: { r: 255, g: 255, b: 255, a: 255 },
      },
    )

    map.llf.lights = [light]

    const model = modelOf(map)

    applyDynamicLightModel(
      model,
      geometryOf(map),
      (): number => {
        return 1
      },
      true,
    )

    const torchLight = TORCH_WEIGHT * 50
    const expected = Math.round(FLOOR_GRAY + torchLight)

    const actual = colorOf(map, 0, 0)

    assert.ok(
      Math.abs(actual - linearOf(expected)) < 1e-6,
      `actual ${actual.toString()}, expected ${linearOf(expected).toString()} (byte ${expected.toString()})`,
    )
  })

  void it('writes nothing without a color attribute', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)
    const geometry = new BufferGeometry()

    assert.equal(applyDynamicLightModel(model, geometry, Math.random, true), false)
  })

  void it('writes nothing into an attribute of another size', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)
    const geometry = new BufferGeometry()

    geometry.setAttribute('color', new BufferAttribute(new Float32Array(18), 2))

    assert.equal(applyDynamicLightModel(model, geometry, Math.random, true), false)
  })

  void it('writes nothing into an attribute of another type', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)
    const geometry = new BufferGeometry()

    geometry.setAttribute('color', new BufferAttribute(new Float64Array(18), 3))

    assert.equal(applyDynamicLightModel(model, geometry, Math.random, true), false)
  })

  void it('writes nothing when the geometry is not the one of the model', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)
    const geometry = new BufferGeometry()

    geometry.setAttribute('color', new BufferAttribute(new Float32Array(9), 3))

    assert.equal(applyDynamicLightModel(model, geometry, Math.random, true), false)
  })

  void it('writes nothing when the layer has no corner', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 }, { fallStart: 10, fallEnd: 20 })]

    const model = modelOf(map)

    assert.equal(applyDynamicLightModel(model, geometryOf(map), Math.random, true), false)
  })
})

void describe('blackenDynamicLightModel', () => {
  void it('draws every corner black', () => {
    const map = litFloor()

    const blackened = blackenDynamicLightModel(geometryOf(map))

    assert.equal(blackened, true)

    const colors: number[] = []

    for (let index = 0; index < 6; index = index + 1) {
      colors.push(colorOf(map, index, 0), colorOf(map, index, 1), colorOf(map, index, 2))
    }

    assert.deepEqual(
      colors.filter((value) => {
        return value !== 0
      }),
      [],
    )
  })

  void it('writes nothing without a color attribute', () => {
    assert.equal(blackenDynamicLightModel(new BufferGeometry()), false)
  })

  void it('writes nothing into an attribute of another size', () => {
    const geometry = new BufferGeometry()

    geometry.setAttribute('color', new BufferAttribute(new Float32Array(18), 2))

    assert.equal(blackenDynamicLightModel(geometry), false)
  })

  void it('writes nothing into an attribute of another type', () => {
    const geometry = new BufferGeometry()

    geometry.setAttribute('color', new BufferAttribute(new Float64Array(18), 3))

    assert.equal(blackenDynamicLightModel(geometry), false)
  })
})

void describe('isDynamicLightModelStale', () => {
  void it('keeps the model while the geometry stands', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    assert.equal(isDynamicLightModelStale(modelOf(map), geometryOf(map)), false)
  })

  void it('drops the model when a position moved', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    geometryOf(map).getAttribute('position').needsUpdate = true

    assert.equal(isDynamicLightModelStale(model, geometryOf(map)), true)
  })

  void it('drops the model when a normal turned', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    geometryOf(map).getAttribute('normal').needsUpdate = true

    assert.equal(isDynamicLightModelStale(model, geometryOf(map)), true)
  })

  void it('drops the model when a new geometry arrived', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    map.solidMeshes[0]?.geometry.setAttribute('position', new BufferAttribute(new Float32Array(18), 3))

    assert.equal(isDynamicLightModelStale(model, geometryOf(map)), true)
  })

  void it('drops the model when the corner count changed', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)
    const geometry = geometryOf(map)
    const position = geometry.getAttribute('position')

    geometry.setAttribute('position', new BufferAttribute(new Float32Array((position.count + 1) * 3), 3))

    assert.equal(isDynamicLightModelStale(model, geometry), true)
  })
})

void describe('refreshDynamicLightBaseColors', () => {
  void it('follows a new flat light', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    setFlatLight(map, 1)
    refreshDynamicLightBaseColors(model, map)

    assert.equal(model.baseColors[0], 255)
  })

  void it('turns a corner white when its palette entry is gone', () => {
    const map = litFloor()

    map.llf.lights = [lightOf({ x: 0, y: -200, z: 0 })]

    const model = modelOf(map)

    map.llf.colors = []
    refreshDynamicLightBaseColors(model, map)

    assert.equal(model.baseColors[0], 255)
  })
})

void describe('refreshDynamicLightLights', () => {
  void it('takes the new color of a light without a build', () => {
    const map = litFloor()
    const torch = lightOf({ x: 0, y: -200, z: 0 })

    map.llf.lights = [torch]

    const model = modelOf(map)
    const lighter = lightOf({ x: 0, y: -200, z: 0 }, { color: { r: 255, g: 0, b: 0, a: 255 } })

    map.setLights([{ index: 0, light: lighter }])

    assert.equal(refreshDynamicLightLights(model, map), true)
    // the frame of the layer reads the light of the model: it is the one of the level now
    assert.equal(model.lights[0], lighter)
  })

  void it('draws the new color on the next frame', () => {
    const map = litFloor()
    const dim = lightOf({ x: 0, y: -200, z: 0 }, { color: { r: 25, g: 0, b: 0, a: 255 } })
    const bright = lightOf({ x: 0, y: -200, z: 0 }, { color: { r: 200, g: 0, b: 0, a: 255 } })

    map.llf.lights = [dim]

    const model = modelOf(map)
    const geometry = geometryOf(map)

    applyDynamicLightModel(
      model,
      geometry,
      () => {
        return 0
      },
      true,
    )

    const dimRed = colorOf(map, 0, 0)

    map.setLights([{ index: 0, light: bright }])
    refreshDynamicLightLights(model, map)
    applyDynamicLightModel(
      model,
      geometry,
      () => {
        return 0
      },
      true,
    )

    assert.ok(colorOf(map, 0, 0) > dimRed)
  })

  void it('asks for a build when the light of the level moved in its own object', () => {
    const map = litFloor()
    const torch = lightOf({ x: 0, y: -200, z: 0 })

    map.llf.lights = [torch]

    const model = modelOf(map)

    // the gizmo of the lights writes the place of the light it holds, without making a new object: the model keeps the
    // same object, so its own place is the one the weights were built with (2026-11-23, the owner: the flicker of a
    // moved torch stayed at the place it started from)
    torch.position.x = 200

    assert.equal(refreshDynamicLightLights(model, map), false)
  })

  void it('asks for a build when a light moved, grew brighter or changed its flags', () => {
    const map = litFloor()
    const torch = lightOf({ x: 0, y: -200, z: 0 })

    map.llf.lights = [torch]

    const model = modelOf(map)
    const moved = lightOf({ x: 20, y: -200, z: 0 })
    const brighter = lightOf({ x: 20, y: -200, z: 0 }, { intensity: 2 })
    const doused = lightOf(
      { x: 20, y: -200, z: 0 },
      { intensity: 2, flags: ArxLightFlags.SemiDynamic | ArxLightFlags.StartExtinguished },
    )

    const needsBuild = [moved, brighter, doused].map((light) => {
      map.setLights([{ index: 0, light }])

      return refreshDynamicLightLights(model, map)
    })

    assert.deepEqual(needsBuild, [false, false, false])
  })
})
