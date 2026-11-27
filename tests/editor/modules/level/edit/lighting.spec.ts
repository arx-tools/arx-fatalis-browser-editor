import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxPolygon } from 'arx-convert/types'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { commandOf } from '../../../../../src/editor/modules/history/commands.ts'
import { createImportMeshRecord } from '../../../../../src/editor/modules/history/records/import.ts'
import { bakeLighting } from '../../../../../src/editor/modules/level/edit/lighting.ts'
import { lightingProfile } from '../../../../../src/editor/modules/level/edit/lightingProfile.ts'
import { levelStore } from '../../../../../src/editor/modules/level/edit/levelStore.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * A face of the test, standing in the middle of the flat level, facing up to the light of its one lamp.
 *
 * @returns The face, as an OBJ import would bring one.
 */
function litFace(): ArxPolygon {
  const corner = { x: 550, y: 0, z: 550, u: 0, v: 0 }
  const normal = { x: 0, y: -1, z: 0 }

  return {
    flags: 64,
    norm: normal,
    normals: [normal, normal, normal, normal],
    area: 2500,
    room: -1,
    textureContainerId: 1,
    vertices: [{ ...corner }, { ...corner, x: 600 }, { ...corner, x: 600, z: 600 }, { ...corner, z: 600 }],
  } as unknown as ArxPolygon
}

void describe('bakeLighting', () => {
  void it('bakes the faces the editor added, so a profile change does not leave them black', async () => {
    const files = createBlankLevelFiles(FLAT_PRESET)
    const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))

    levelStore.map.value = map
    lightingProfile.value = 'Arx'

    // an imported face: the file of the level does not have it, the editor does (`map.polygons`)
    commandOf(createImportMeshRecord([litFace()], { id: 1, name: 'jorge-[stone].jpg' }, true), map)?.apply()

    await bakeLighting()

    const face = map.polygons.at(-1)
    const index = face?.vertices[0]?.llfColorIdx ?? -1
    const color = map.llf.colors[index]

    // the face stands under the light of the level: the palette of the whole level reads it, and its color is the light
    assert.notEqual(color, undefined)
    assert.equal((color?.r ?? 0) + (color?.g ?? 0) + (color?.b ?? 0) > 40, true)
  })
})
