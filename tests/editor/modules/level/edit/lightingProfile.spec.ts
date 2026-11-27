import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createBlankLevelFiles, FLAT_PRESET } from '../../../../../src/editor/modules/level/blankLevel.ts'
import { lightingProfile, paletteBakeOptionsOf } from '../../../../../src/editor/modules/level/edit/lightingProfile.ts'
import { ArxMap } from '../../../../../src/generator/ArxMap.ts'
import { Settings } from '../../../../../src/generator/Settings.ts'

/**
 * The flat blank level of the test: the bake reads its meshes as the occluders.
 *
 * @returns The level, ready to bake.
 */
function flatMap(): ArxMap {
  const files = createBlankLevelFiles(FLAT_PRESET)

  return new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
}

void describe('paletteBakeOptionsOf', () => {
  void it('tests the way of the light for the Realistic profile, and for that one only', () => {
    const map = flatMap()

    lightingProfile.value = 'Realistic'

    // the profile that says "realistic" is the one with the shadows: a mesh under the light makes the floor dark
    assert.equal(paletteBakeOptionsOf(map).shadows, true)

    // the look of the game, and the flat one, read the lights without the rays
    lightingProfile.value = 'Arx'
    assert.equal(paletteBakeOptionsOf(map).shadows, false)
    lightingProfile.value = 'Flat'
    assert.equal(paletteBakeOptionsOf(map).shadows, false)
  })
})
