import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxColor, type ArxPolygon } from 'arx-convert/types'
import { Color, SRGBColorSpace } from 'three'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../../src/editor/modules/level/blankLevel.ts'
import {
  writeBakedColors,
  writeBakedCornerColors,
} from '../../../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
import { setFlatLight } from '../../../../../../src/editor/modules/level/edit/lightingFlat.ts'
import { ArxMap } from '../../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../../src/generator/Settings.ts'

/**
 * Builds a level of one flat floor: the smallest map the paint can give a colour attribute.
 *
 * @returns The map, with its solid mesh.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * The first face of the level, which every test of the file paints.
 *
 * @param map The level to read.
 *
 * @returns The first face.
 *
 * @throws When the level has no face.
 */
function firstPolygonOf(map: ArxMap): ArxPolygon {
  const polygon = map.polygons[0]

  if (polygon === undefined) {
    throw new Error('the level has no face')
  }

  return polygon
}

/**
 * The linear values of a palette colour, the way the attribute carries them.
 *
 * @param color The colour of the palette, in sRGB.
 *
 * @returns The three channels in the working colour space.
 */
function linearOf(color: ArxColor): number[] {
  const converted = new Color().setRGB(color.r / 255, color.g / 255, color.b / 255, SRGBColorSpace)

  return [converted.r, converted.g, converted.b]
}

/**
 * The colours of the first corners of the solid mesh.
 *
 * @param map The level to read.
 * @param count How many corners to read.
 *
 * @returns The colours, three channels each.
 */
function firstColorsOf(map: ArxMap, count: number): number[] {
  const attribute = map.solidMeshes[0]?.geometry.getAttribute('color')
  const values: number[] = []

  for (let index = 0; index < count * 3; index = index + 1) {
    values.push(attribute?.array[index] ?? Number.NaN)
  }

  return values
}

void describe('writeBakedColors', () => {
  void it('leaves every corner white when the level has no palette', () => {
    const map = flatMap()

    writeBakedColors(map)

    const attribute = map.solidMeshes[0]?.geometry.getAttribute('color')

    assert.notEqual(attribute, undefined)
    assert.equal(attribute?.count, map.solidMeshes[0]?.geometry.getAttribute('position').count)
    assert.deepEqual(firstColorsOf(map, 6), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  void it('takes the palette colour of every corner of a face', () => {
    const map = flatMap()
    const palette: ArxColor[] = [
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ]
    const polygon = firstPolygonOf(map)

    map.llf.colors = palette

    for (const [index, vertex] of polygon.vertices.entries()) {
      vertex.llfColorIdx = index
    }

    writeBakedColors(map)

    const expected = [...linearOf(palette[0]), ...linearOf(palette[1]), ...linearOf(palette[2])]
    // the renderer walks a quad as a, b, c and c, b, d
    const quad = [...expected, ...linearOf(palette[2]), ...linearOf(palette[1]), ...linearOf(palette[3])]

    assert.deepEqual(firstColorsOf(map, 6), quad)
  })

  void it('lights every corner with the flat light, the levels without a palette included', () => {
    const map = flatMap()

    setFlatLight(map, 0.5)
    writeBakedColors(map)

    const values = firstColorsOf(map, 6)
    const [red, green, blue] = values

    // the blank level has no palette: the flat light is one grey over the whole level, not a palette entry
    assert.deepEqual([green, blue], [red, red])
    assert.ok((red ?? 0) > 0.1)
    assert.ok(
      values.every((value) => {
        return value === red
      }),
    )

    setFlatLight(map, undefined)
  })

  void it('leaves a blended face white, so the material keeps its own dimming', () => {
    const map = flatMap()
    const polygon = firstPolygonOf(map)

    map.llf.colors = [{ r: 0, g: 0, b: 0, a: 255 }]
    polygon.flags = ArxPolygonFlags.Quad | ArxPolygonFlags.Transparent
    polygon.transval = 0.5
    polygon.vertices[0].llfColorIdx = 0
    polygon.vertices[1].llfColorIdx = 0
    polygon.vertices[2].llfColorIdx = 0
    polygon.vertices[3].llfColorIdx = 0

    writeBakedColors(map)

    assert.deepEqual(firstColorsOf(map, 6), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  void it('leaves a water face white', () => {
    const map = flatMap()
    const polygon = firstPolygonOf(map)

    map.llf.colors = [{ r: 0, g: 0, b: 0, a: 255 }]
    polygon.flags = ArxPolygonFlags.Quad | ArxPolygonFlags.Water
    polygon.vertices[0].llfColorIdx = 0
    polygon.vertices[1].llfColorIdx = 0
    polygon.vertices[2].llfColorIdx = 0
    polygon.vertices[3].llfColorIdx = 0

    writeBakedColors(map)

    assert.deepEqual(firstColorsOf(map, 6), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })
})

void describe('writeBakedCornerColors', () => {
  /**
   * The palette of four corners of the tests, and the entries of the face.
   *
   * @param map The level to paint.
   *
   * @returns The palette, so a test can change one entry of it.
   */
  function paintPalette(map: ArxMap): ArxColor[] {
    const palette: ArxColor[] = [
      { r: 255, g: 0, b: 0, a: 255 },
      { r: 0, g: 255, b: 0, a: 255 },
      { r: 0, g: 0, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ]
    const polygon = firstPolygonOf(map)

    map.llf.colors = palette

    for (const [index, vertex] of polygon.vertices.entries()) {
      vertex.llfColorIdx = index
    }

    writeBakedColors(map)

    return palette
  }

  void it('writes the corners of the entries it is given, and leaves the others alone', () => {
    const map = flatMap()
    const palette = paintPalette(map)
    const changed: ArxColor = { r: 10, g: 20, b: 30, a: 255 }

    palette[1] = changed

    const written = writeBakedCornerColors(map, new Set([1]))
    const values = firstColorsOf(map, 6)
    // the attribute is a float32 array: the expected values go through one too
    const linear = linearOf(changed).map((value) => {
      return Math.fround(value)
    })

    assert.equal(written, true)
    // the renderer walks the quad as a, b, c and c, b, d: the entry 1 is the second and the fifth corner
    assert.deepEqual(values.slice(3, 6), linear)
    assert.deepEqual(values.slice(12, 15), linear)
    // the entries the writer was not told about keep the colour of the full write
    assert.deepEqual(values.slice(0, 3), linearOf(palette[0] ?? { r: 0, g: 0, b: 0, a: 255 }))
    assert.deepEqual(values.slice(6, 9), linearOf(palette[2] ?? { r: 0, g: 0, b: 0, a: 255 }))
    assert.deepEqual(values.slice(15, 18), linearOf(palette[3] ?? { r: 0, g: 0, b: 0, a: 255 }))
  })

  void it('leaves a blended face white, whatever the palette says', () => {
    const map = flatMap()
    const palette = paintPalette(map)
    const polygon = firstPolygonOf(map)

    polygon.flags = ArxPolygonFlags.Quad | ArxPolygonFlags.Transparent
    polygon.transval = 0.5
    writeBakedColors(map)
    palette[1] = { r: 10, g: 20, b: 30, a: 255 }

    writeBakedCornerColors(map, new Set([1]))

    assert.deepEqual(firstColorsOf(map, 6), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })

  void it('does not write on the flat profile, which does not read the palette', () => {
    const map = flatMap()
    const palette = paintPalette(map)

    setFlatLight(map, 0.5)
    palette[1] = { r: 10, g: 20, b: 30, a: 255 }

    assert.equal(writeBakedCornerColors(map, new Set([1])), false)

    setFlatLight(map, undefined)
  })

  void it('gives up when the mesh has no colour attribute yet', () => {
    const map = flatMap()
    const palette = paintPalette(map)
    const geometry = map.solidMeshes[0]?.geometry

    geometry?.deleteAttribute('color')
    palette[1] = { r: 10, g: 20, b: 30, a: 255 }

    assert.equal(writeBakedCornerColors(map, new Set([1])), false)
  })
})
