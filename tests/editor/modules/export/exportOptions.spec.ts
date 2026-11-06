import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exportSeedOf, levelIndexOf, MIN_LEVEL_INDEX } from '../../../../src/editor/modules/export/exportOptions.ts'
import { NEW_QUEST_LEVEL_INDEX } from '../../../../src/editor/modules/level/blankLevel.ts'

void describe('levelIndexOf', () => {
  void it('reads the number of the field', () => {
    assert.equal(levelIndexOf('8'), 8)
    assert.equal(levelIndexOf('0'), MIN_LEVEL_INDEX)
    assert.equal(levelIndexOf('13'), 13)
  })

  void it('gives the empty field the index of a new quest', () => {
    assert.equal(levelIndexOf(''), NEW_QUEST_LEVEL_INDEX)
    assert.equal(levelIndexOf(' '.repeat(3)), NEW_QUEST_LEVEL_INDEX)
  })

  void it('gives a field that is not a number the index of a new quest', () => {
    assert.equal(levelIndexOf('abc'), NEW_QUEST_LEVEL_INDEX)
    assert.equal(levelIndexOf('level 8'), NEW_QUEST_LEVEL_INDEX)
  })

  void it('reads the beginning of a number, the way a number field does', () => {
    assert.equal(levelIndexOf('3.7'), 3)
    assert.equal(levelIndexOf(' 12 '), 12)
  })

  void it('keeps the index at the first level of the game', () => {
    assert.equal(levelIndexOf('-3'), MIN_LEVEL_INDEX)
    assert.equal(levelIndexOf('-0'), MIN_LEVEL_INDEX)
  })
})

void describe('exportSeedOf', () => {
  void it('reads the seed of the field', () => {
    assert.equal(exportSeedOf('590085197'), '590085197')
    assert.equal(exportSeedOf(' 590085197 '), '590085197')
  })

  void it('gives nothing for an empty field', () => {
    assert.equal(exportSeedOf(''), undefined)
    assert.equal(exportSeedOf(' '.repeat(3)), undefined)
  })
})
