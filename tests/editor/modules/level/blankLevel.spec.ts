import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ArxMap } from '../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../src/generator/Settings.ts'
import {
  BLANK_LEVEL_TILE_SIZE,
  createBlankLevelFiles,
  FLAT_PRESET,
  MINIMAL_PRESET,
  NEW_LEVEL_PRESETS,
  type NewLevelPreset,
} from '../../../../src/editor/modules/level/blankLevel.ts'
import { createBlankLevelSource, loadLevel } from '../../../../src/editor/modules/level/levelSource.ts'
import { BLANK_LEVEL_TEXTURE, GENERATOR_ASSETS } from '../../../../src/generator/assets.ts'

/**
 * Builds the map of a blank level the way the editor does: the three files go through the same loader the original
 * levels do.
 *
 * @param preset How the floor of the level starts, `Minimal` by default.
 *
 * @returns The map of its floor.
 */
function blankMap(preset?: NewLevelPreset): ArxMap {
  const files = createBlankLevelFiles(preset)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '123456789' }))
}

void describe('createBlankLevelFiles', () => {
  void it('gives the three packed files', () => {
    const files = createBlankLevelFiles()

    assert.ok(files.dlf.byteLength > 0)
    assert.ok(files.fts.byteLength > 0)
    assert.ok(files.llf.byteLength > 0)
  })

  void it('makes a level of one quad', () => {
    const map = blankMap()

    assert.deepEqual(map.statistics, {
      faceCount: 1,
      triangleCount: 0,
      quadCount: 1,
      lightCount: 0,
      anchorCount: 0,
      portalCount: 0,
    })
    assert.equal(map.polygons.length, 1)
    // a quad is two triangles, so six vertices in the geometry of the mesh
    assert.equal(map.solidMeshes[0].geometry.getAttribute('position').count, 6)
  })

  void it('stands the quad under the feet of the player', () => {
    const map = blankMap()
    const box = map.solidMeshes[0].geometry.boundingBox
    const half = (100 * BLANK_LEVEL_TILE_SIZE) / 200

    // the mesh is built around the scene position, which is the middle of the quad
    assert.deepEqual([box?.min.x, box?.min.z], [-half, -half])
    assert.deepEqual([box?.max.x, box?.max.z], [half, half])
    // the floor is flat, and the player stands above it: the stored position is relative to the scene position (the
    // middle of the quad), and the game's Y axis points down, so the eye is below the floor's 0 on it
    assert.deepEqual([box?.min.y, box?.max.y], [0, 0])
    assert.deepEqual(map.player.position, { x: 0, y: -180, z: 0 })
  })

  void it('names the texture of the floor, which is the own one of the generator', () => {
    const map = blankMap()
    const texture = map.polygons[0]?.textureContainerId ?? 0

    assert.equal(map.textureNameOf(texture), BLANK_LEVEL_TEXTURE)
    // the container id is the first one: a level that brings its own files numbers them from 1
    assert.equal(texture, 1)
  })

  void it('has the texture file it names', async () => {
    const url = GENERATOR_ASSETS[BLANK_LEVEL_TEXTURE]
    const file = await readFile(fileURLToPath(url))

    // the level stores the plain name, the build stores the file under a url: the two have to meet
    assert.ok(file.byteLength > 0)
  })

  void it('has no wall, no light and nothing else in it', () => {
    const map = blankMap()

    assert.equal(map.lights.length, 0)
    assert.equal(map.meshes.length, 1)
  })
})

void describe('the presets of a new level', () => {
  void it('lists Minimal and then Flat', () => {
    assert.deepEqual(
      NEW_LEVEL_PRESETS.map((preset) => {
        return [preset.name, preset.tiles]
      }),
      [
        ['Minimal', 1],
        ['Flat', 11],
      ],
    )
  })

  void it('starts with the Minimal one', () => {
    assert.equal(blankMap().statistics.faceCount, 1)
    assert.equal(MINIMAL_PRESET.tiles, 1)
    assert.equal(NEW_LEVEL_PRESETS[0], MINIMAL_PRESET)
  })

  void it('makes an 11×11 plane of tiles on the Flat one', () => {
    const map = blankMap(FLAT_PRESET)
    const half = (11 * BLANK_LEVEL_TILE_SIZE) / 2
    const box = map.solidMeshes[0].geometry.boundingBox

    assert.equal(map.statistics.faceCount, 11 * 11)
    assert.equal(map.statistics.quadCount, 11 * 11)
    // the mesh is built around the scene position: a symmetric box means the scene sits in the middle of the plane,
    // and the standing player is measured from there
    assert.deepEqual([box?.min.x, box?.min.z], [-half, -half])
    assert.deepEqual([box?.max.x, box?.max.z], [half, half])
    assert.deepEqual(map.player.position, { x: 0, y: -180, z: 0 })
  })
})

void describe('createBlankLevelSource', () => {
  void it('names itself, so a picker can show it', () => {
    assert.equal(createBlankLevelSource().label, 'Blank level')
  })

  void it('builds its files without a network', () => {
    const files = createBlankLevelSource().load()

    assert.ok(!(files instanceof Promise))
  })

  void it('builds the same level as the files do', async () => {
    const map = await loadLevel(createBlankLevelSource())

    assert.equal(map.statistics.faceCount, 1)
    assert.equal(map.statistics.quadCount, 1)
  })
})
