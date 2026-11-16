import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxColor, type ArxPolygon } from 'arx-convert/types'
import { Color, SRGBColorSpace } from 'three'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../../src/editor/modules/level/blankLevel.ts'
import { writeBakedColors } from '../../../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
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
