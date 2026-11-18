import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import type { ArxColor, ArxLight } from 'arx-convert/types'
import { Color, SRGBColorSpace } from 'three'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { refreshLightPalette } from '../../../../../src/editor/modules/level/edit/lightPalette.ts'
import { writeBakedColors } from '../../../../../src/editor/modules/level/edit/levelTextures/bakedColors.ts'
import { lightingCacheVersion } from '../../../../../src/editor/modules/level/edit/lightingCache.ts'
import { lightingProfile } from '../../../../../src/editor/modules/level/edit/lightingProfile.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { bakeLlfColors } from '../../../../../src/generator/lighting.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

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
   * The colour of the light.
   */
  readonly color?: ArxColor
  /**
   * How far the light reaches, in the units of the level.
   */
  readonly fallEnd?: number
}

/**
 * The three linear channels of a baked grey, the way the attribute carries them.
 *
 * @param grey The grey in sRGB, from 0 to 255.
 *
 * @returns The channels, as a float32 array holds them.
 */
function linearOfGrey(grey: number): number[] {
  const color = new Color().setRGB(grey / 255, grey / 255, grey / 255, SRGBColorSpace)

  return [color.r, color.g, color.b].map((channel) => {
    return Math.fround(channel)
  })
}

/**
 * A level of one floor tile, with a palette entry on every corner.
 *
 * @returns The map, ready to bake.
 *
 * @throws When the blank level has no face.
 */
function litFloor(): ArxMap {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const polygon = map.polygons[0]

  if (polygon === undefined) {
    throw new Error('the blank level has no face')
  }

  map.llf.colors = [0, 1, 2, 3].map(() => {
    return { r: 255, g: 255, b: 255, a: 255 }
  })

  for (const [index, vertex] of polygon.vertices.entries()) {
    vertex.llfColorIdx = index
  }

  return map
}

/**
 * A light above one corner of the blank floor, 20 units above it.
 *
 * @param corner Which corner of the floor.
 * @param options The colour of the light and how far it reaches.
 *
 * @returns The light of the LLF, which reaches down onto the corner.
 */
function lightAbove(corner: Corner, options: AboveOptions = {}): ArxLight {
  return {
    position: { x: corner.x - SCENE.x, y: -20, z: corner.z - SCENE.z },
    color: options.color ?? { r: 255, g: 255, b: 255, a: 255 },
    fallStart: 0,
    fallEnd: options.fallEnd ?? 30,
    intensity: 1,
    exFlicker: { r: 0, g: 0, b: 0, a: 1 },
    exRadius: 0,
    exFrequency: 0,
    exSize: 0,
    exSpeed: 0,
    exFlareSize: 0,
    flags: 0,
  }
}

/**
 * Bakes the palette of a level the way the editor does, and paints it on the mesh.
 *
 * @param map The level to bake.
 */
function bakeAndPaint(map: ArxMap): void {
  map.llf.colors = bakeLlfColors(map.fts, map.llf, { mode: 'Arx' })

  writeBakedColors(map)
}

/**
 * The channels of the `color` attribute of the solid mesh.
 *
 * @param map The level to read.
 *
 * @returns The values, three channels per corner.
 */
function colorsOf(map: ArxMap): number[] {
  const attribute = map.solidMeshes[0]?.geometry.getAttribute('color')

  return [...((attribute?.array as Float32Array | undefined) ?? new Float32Array())]
}

/**
 * The vertex of the attribute a corner of the palette sits on.
 *
 * @remarks
 * The renderer walks a quad as `a, b, c` and `c, b, d`, so the entry 1 is the second and the fifth corner, and the entry
 * 3 is the sixth.
 *
 * @param entry The palette entry of the corner.
 *
 * @returns The vertex of the attribute.
 */
function vertexOf(entry: number): number {
  return [0, 1, 2, 2, 1, 3][entry] ?? 0
}

/**
 * The three channels of a corner of the attribute.
 *
 * @param values The channels of the attribute.
 * @param entry The palette entry of the corner.
 *
 * @returns The channels of the corner.
 */
function cornerOf(values: number[], entry: number): number[] {
  const at = vertexOf(entry) * 3

  return values.slice(at, at + 3)
}

void describe('refreshLightPalette', () => {
  beforeEach(() => {
    lightingProfile.value = 'Arx'
  })

  void it('bakes the palette and the attribute where the light moved', () => {
    const map = litFloor()
    const before = lightAbove({ x: 0, y: 0, z: 0 })
    const after = lightAbove({ x: 100, y: 0, z: 100 }, { color: { r: 0, g: 0, b: 255, a: 255 } })

    map.llf.lights = [before]
    bakeAndPaint(map)

    const version = lightingCacheVersion()

    map.setLights([{ index: 0, light: after }])
    refreshLightPalette(map, [{ before, after }])

    // the corner the light left goes back to the ambient floor of the profile, in the palette and on the mesh
    assert.deepEqual(map.llf.colors[0], { r: 23, g: 23, b: 23, a: 255 })
    assert.deepEqual(cornerOf(colorsOf(map), 0), linearOfGrey(23))

    // the corner it reaches now takes the palette and the attribute of the full bake
    const reference = litFloor()

    reference.llf.lights = [after]
    bakeAndPaint(reference)

    assert.deepEqual(map.llf.colors[3], reference.llf.colors[3])
    assert.deepEqual(cornerOf(colorsOf(map), 3), cornerOf(colorsOf(reference), 3))

    // the palette of the profile is not the one the last full bake wrote: the cache of the profiles is dropped
    assert.ok(lightingCacheVersion() > version)
  })

  void it('leaves the palette entries of the corners no light of the edit reaches alone', () => {
    const map = litFloor()
    const before = lightAbove({ x: 0, y: 0, z: 0 })
    const after = lightAbove({ x: 0, y: 0, z: 0 }, { color: { r: 0, g: 0, b: 255, a: 255 } })

    map.llf.lights = [before]
    bakeAndPaint(map)

    const untouched = [map.llf.colors[1], map.llf.colors[2]]

    map.setLights([{ index: 0, light: after }])
    refreshLightPalette(map, [{ before, after }])

    assert.deepEqual([map.llf.colors[1], map.llf.colors[2]], untouched)
    // the corner of the light itself took the new colour
    assert.ok((map.llf.colors[0]?.b ?? 0) > (map.llf.colors[0]?.r ?? 0))
  })

  void it('gives the corners back when the light shrinks', () => {
    const map = litFloor()
    const wide = lightAbove({ x: 0, y: 0, z: 0 }, { fallEnd: 300 })
    const narrow = lightAbove({ x: 0, y: 0, z: 0 }, { fallEnd: 30 })

    map.llf.lights = [wide]
    bakeAndPaint(map)

    // the wide light reaches the corner at the other end of the tile too
    assert.ok((map.llf.colors[2]?.r ?? 0) > 23)

    map.setLights([{ index: 0, light: narrow }])
    refreshLightPalette(map, [{ before: wide, after: narrow }])

    // the sphere of the light before the edit is what takes the corners it no longer reaches back to the floor
    assert.deepEqual(map.llf.colors[2], { r: 23, g: 23, b: 23, a: 255 })
  })

  void it('does nothing on the flat profile, which does not read the palette', () => {
    lightingProfile.value = 'Flat'

    const map = litFloor()
    const before = lightAbove({ x: 0, y: 0, z: 0 })
    const after = lightAbove({ x: 100, y: 0, z: 100 })

    map.llf.lights = [before]
    bakeAndPaint(map)

    const palette = structuredClone(map.llf.colors)
    const colors = colorsOf(map)

    map.setLights([{ index: 0, light: after }])
    refreshLightPalette(map, [{ before, after }])

    assert.deepEqual(map.llf.colors, palette)
    assert.deepEqual(colorsOf(map), colors)
  })
})
