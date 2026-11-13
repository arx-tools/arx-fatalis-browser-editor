import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { insertMapInto } from '../../../../../src/editor/modules/level/edit/insertLevel.ts'
import {
  createBlankLevelFiles,
  FLAT_PRESET,
  MINIMAL_PRESET,
} from '../../../../../src/editor/modules/level/blankLevel.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * Builds a map from one of the blank presets of the editor.
 *
 * @param preset The preset to build: the flat plane is the 11×11 floor, the minimal one a single quad.
 *
 * @returns The map, ready to be edited.
 */
function mapOf(preset: typeof FLAT_PRESET): ArxMap {
  const files = createBlankLevelFiles(preset)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

/**
 * The centre of the bounding box of a list of polygons, in the game's coordinates.
 *
 * @param polygons The polygons to measure.
 *
 * @returns The centre of the box the vertices fill.
 */
function boxOf(polygons: readonly ArxPolygon[]): { x: number; y: number; z: number } {
  let left = Number.POSITIVE_INFINITY
  let right = Number.NEGATIVE_INFINITY
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  let near = Number.POSITIVE_INFINITY
  let far = Number.NEGATIVE_INFINITY

  for (const polygon of polygons) {
    for (const vertex of polygon.vertices) {
      left = Math.min(left, vertex.x)
      right = Math.max(right, vertex.x)
      top = Math.min(top, vertex.y)
      bottom = Math.max(bottom, vertex.y)
      near = Math.min(near, vertex.z)
      far = Math.max(far, vertex.z)
    }
  }

  return { x: (left + right) / 2, y: (top + bottom) / 2, z: (near + far) / 2 }
}

/**
 * The centre of the box the polygons of a map fill.
 *
 * @param map The map to measure.
 *
 * @returns The centre of the box the vertices of the map fill.
 */
function centreOf(map: ArxMap): { x: number; y: number; z: number } {
  return boxOf(map.polygons)
}

void describe('insertMapInto', () => {
  void it('adds the polygons of the source at the end of the target', () => {
    const target = mapOf(FLAT_PRESET)
    const source = mapOf(MINIMAL_PRESET)
    const before = target.polygons.length

    const faces = insertMapInto(target, source, { x: 100, y: 200, z: 300 })

    assert.equal(target.polygons.length, before + source.polygons.length)
    assert.deepEqual(
      faces,
      source.polygons.map((_polygon, index) => {
        return before + index
      }),
    )
  })

  void it('stands the middle of the source at the given point', () => {
    const target = mapOf(FLAT_PRESET)
    const source = mapOf(FLAT_PRESET)
    const point = { x: 1000, y: -200, z: 1200 }

    insertMapInto(target, source, point)

    const inserted = {
      polygons: target.polygons.slice(mapOf(FLAT_PRESET).polygons.length),
    }

    // the inserted level is a copy of the flat plane: its own middle is where the point says
    const centre = boxOf([...inserted.polygons])

    assert.ok(Math.abs(centre.x - point.x) < 1)
    assert.ok(Math.abs(centre.y - point.y) < 1)
    assert.ok(Math.abs(centre.z - point.z) < 1)
  })

  void it('shares the texture container a both levels use', () => {
    const target = mapOf(MINIMAL_PRESET)
    const source = mapOf(FLAT_PRESET)
    const containers = target.fts.textureContainers.length

    insertMapInto(target, source, { x: 0, y: 0, z: 0 })

    // the blank levels paint with the same file: the inserted faces point at the container the target already has
    assert.equal(target.fts.textureContainers.length, containers)

    const name = target.textureNameOf(target.polygons[0]?.textureContainerId ?? -1)

    assert.notEqual(name, undefined)
    assert.equal(target.textureContainerIdOfName(name ?? ''), target.polygons[0]?.textureContainerId)
  })

  void it('keeps the source level as it was', () => {
    const target = mapOf(MINIMAL_PRESET)
    const source = mapOf(FLAT_PRESET)
    const centreBefore = centreOf(source)
    const countBefore = source.polygons.length

    insertMapInto(target, source, { x: 5000, y: 0, z: 5000 })

    assert.equal(source.polygons.length, countBefore)
    assert.deepEqual(centreOf(source), centreBefore)
  })

  void it('puts the faces into no room of the target', () => {
    const target = mapOf(MINIMAL_PRESET)
    const source = mapOf(FLAT_PRESET)

    const faces = insertMapInto(target, source, { x: 0, y: 0, z: 0 })
    const rooms = faces.map((face) => {
      return target.polygons[face]?.room
    })

    assert.deepEqual(
      rooms,
      faces.map(() => {
        return -1
      }),
    )
  })

  void it('gives nothing for a source without a polygon', () => {
    const target = mapOf(MINIMAL_PRESET)
    const source = mapOf(MINIMAL_PRESET)

    source.deletePolygons([0])

    assert.deepEqual(insertMapInto(target, source, { x: 0, y: 0, z: 0 }), [])
  })
})
