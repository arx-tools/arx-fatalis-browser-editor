import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { CustomBlending, DoubleSide, FrontSide, Texture } from 'three'
import type { ArxMap } from '../../../../../../src/generator/ArxMap.ts'
import {
  buildMaterial,
  paintKeyOf,
  paintKeyOfPolygon,
  type PaintKey,
} from '../../../../../../src/editor/modules/level/edit/levelTextures/paint.ts'

/**
 * The texture of the test: the material of a key only carries it.
 */
const texture = new Texture()

/**
 * Builds a paint key of the test.
 *
 * @param overrides The parts of the key the case is about.
 *
 * @returns A key of a face without a texture, drawn opaque and from one side.
 */
function keyOf(overrides: Partial<PaintKey> = {}): PaintKey {
  return { name: undefined, doubleSided: false, blend: 'opaque', trans: 1, ...overrides }
}

/**
 * Builds a level of the test: only the name of a container is read.
 *
 * @param names The names of the containers, by the id a polygon points at.
 *
 * @returns A level that names those containers and nothing else.
 */
function levelOf(names: ReadonlyMap<number, string>): ArxMap {
  return {
    textureNameOf: (id: number): string | undefined => {
      return names.get(id)
    },
  } as unknown as ArxMap
}

/**
 * Builds a face of the test, with the flags the case is about.
 *
 * @param flags The bits of the face.
 * @param transval The transparency value of the face.
 * @param textureContainerId The id of the container it points at, the one of no container by default.
 *
 * @returns A face that says how the game blends it.
 */
function faceOf(flags: number, transval: number, textureContainerId = 0): ArxPolygon {
  return { flags, transval, textureContainerId } as unknown as ArxPolygon
}

void describe('buildMaterial', () => {
  void it('draws the texture the level has for a face', () => {
    const material = buildMaterial(keyOf({ name: 'a.bmp' }), new Map([['a.bmp', texture]]), undefined)

    assert.equal(material.map, texture)
    assert.equal(material.transparent, false)
    assert.equal(material.alphaTest, 0.5)
  })

  void it('draws the placeholder of a face without a texture see-through', () => {
    const material = buildMaterial(keyOf(), new Map(), texture)

    assert.equal(material.map, texture)
    assert.equal(material.transparent, true)
    assert.equal(material.opacity, 0.5)
    assert.equal(material.depthWrite, false)
  })

  void it('keeps the blend mode of a face without a texture', () => {
    const material = buildMaterial(keyOf({ blend: 'subtractive' }), new Map(), texture)

    assert.equal(material.blending, CustomBlending)
    assert.equal(material.transparent, true)
    assert.equal(material.depthWrite, false)
  })

  void it('draws the placeholder of a face whose texture has no file as it is', () => {
    const material = buildMaterial(keyOf({ name: 'a.bmp' }), new Map(), texture)

    assert.equal(material.map, texture)
    assert.equal(material.transparent, false)
  })

  void it('draws the flat colour when there is no placeholder', () => {
    const material = buildMaterial(keyOf({ name: 'a.bmp' }), new Map(), undefined)

    assert.equal(material.map, null)
    assert.equal(material.transparent, false)
  })

  void it('draws a face without a texture and without a placeholder as the flat colour', () => {
    const material = buildMaterial(keyOf(), new Map(), undefined)

    assert.equal(material.map, null)
    assert.equal(material.transparent, false)
  })

  void it('draws both sides of a two-sided face', () => {
    const material = buildMaterial(keyOf({ doubleSided: true }), new Map(), undefined)

    assert.equal(material.side, DoubleSide)
    assert.equal(buildMaterial(keyOf(), new Map(), undefined).side, FrontSide)
  })
})

void describe('paintKeyOf', () => {
  void it('writes the parts of the key of a run', () => {
    const key = keyOf({ name: '[stone]_wall1.bmp', doubleSided: true, blend: 'additive', trans: 0.5 })

    assert.equal(paintKeyOf(key), 'double|additive|0.50|[stone]_wall1.bmp')
  })

  void it('writes a face without a texture with an empty name', () => {
    assert.equal(paintKeyOf(keyOf()), 'front|opaque|1.00|')
  })
})

void describe('paintKeyOfPolygon', () => {
  void it('reads the name, the side and the blend of a face', () => {
    const level = levelOf(new Map([[7, 'a.bmp']]))
    const key = paintKeyOfPolygon(level, faceOf(ArxPolygonFlags.Transparent | ArxPolygonFlags.DoubleSided, 0.5, 7))

    assert.equal(key.name, 'a.bmp')
    assert.equal(key.doubleSided, true)
    assert.equal(key.blend, 'alpha')
    assert.equal(key.trans, 0.5)
  })

  void it('reads a face without a texture, which is opaque and one-sided', () => {
    const key = paintKeyOfPolygon(levelOf(new Map()), faceOf(ArxPolygonFlags.None, 0))

    assert.equal(key.name, undefined)
    assert.equal(key.doubleSided, false)
    assert.equal(key.blend, 'opaque')
    assert.equal(key.trans, 1)
  })
})
