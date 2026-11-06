import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { HistoryRecord } from '../../../../../src/editor/modules/history/records.ts'
import {
  availableMapIdOf,
  editedMapIdsOf,
  mapEntryOf,
  pascalCaseOf,
  type MapGroupEntry,
} from '../../../../../src/editor/modules/level/source/maps.ts'

/**
 * A step of the test: a delete of the first face.
 *
 * @returns The record of the step.
 */
function record(): HistoryRecord {
  return { version: 1, kind: 'deleteFaces', faces: [0] }
}

void describe('availableMapIdOf', () => {
  void it('keeps the map when the list has it', () => {
    assert.equal(availableMapIdOf('arx:8', [8, 11]), 'arx:8')
    assert.equal(availableMapIdOf('blank:flat', []), 'blank:flat')
  })

  void it('drops a level the list does not have', () => {
    assert.equal(availableMapIdOf('arx:8', [11]), undefined)
  })

  void it('drops a map that is not a kind of the list', () => {
    assert.equal(availableMapIdOf('nowhere:1', [8]), undefined)
    assert.equal(availableMapIdOf('arx:not-a-number', [8]), undefined)
  })

  void it('gives nothing when the url names no map', () => {
    assert.equal(availableMapIdOf(undefined, [8]), undefined)
  })
})

void describe('editedMapIdsOf', () => {
  void it('marks the maps that have steps on them', () => {
    const saved = new Map([
      ['arx:8', [record()]],
      ['arx:11', []],
    ])

    assert.deepEqual(editedMapIdsOf(saved, 'blank:flat', false), new Set(['arx:8']))
  })

  void it('marks the map on the screen from its live history', () => {
    assert.deepEqual(editedMapIdsOf(new Map(), 'arx:8', true), new Set(['arx:8']))
  })

  void it('clears the map on the screen when every step was taken back', () => {
    const saved = new Map([['arx:8', [record()]]])

    assert.deepEqual(editedMapIdsOf(saved, 'arx:8', false), new Set())
  })
})

void describe('pascalCaseOf', () => {
  void it('writes a file name as a name', () => {
    assert.equal(pascalCaseOf('lalees-minigame.zip'), 'Lalees Minigame')
    assert.equal(pascalCaseOf('my_level.dlf'), 'My Level')
    assert.equal(pascalCaseOf('Arx Level 8'), 'Arx Level 8')
  })

  void it('keeps the name of one word', () => {
    assert.equal(pascalCaseOf('level13'), 'Level13')
    assert.equal(pascalCaseOf('spider'), 'Spider')
  })

  void it('gives an empty name for a name without a letter', () => {
    assert.equal(pascalCaseOf('---'), '')
    assert.equal(pascalCaseOf(''), '')
  })
})

void describe('mapEntryOf', () => {
  /**
   * A list of the test: two groups, one map in each.
   *
   * @returns The two groups, in the order the header shows them.
   */
  function groups(): MapGroupEntry[] {
    return [
      {
        group: 'blank',
        label: 'Blank maps',
        entries: [{ id: 'blank:flat', group: 'blank', label: 'Flat Plane', edited: false }],
      },
      {
        group: 'arx',
        label: 'Original Arx levels',
        entries: [{ id: 'arx:8', group: 'arx', label: 'Level 8', edited: true }],
      },
    ]
  }

  void it('finds the map of the value', () => {
    assert.deepEqual(mapEntryOf('arx:8', groups()), { id: 'arx:8', group: 'arx', label: 'Level 8', edited: true })
    assert.equal(mapEntryOf('arx:9', groups()), undefined)
    assert.equal(mapEntryOf('', groups()), undefined)
  })
})
