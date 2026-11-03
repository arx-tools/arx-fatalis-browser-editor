import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  historyOfMap,
  mapHistoryRecords,
  rememberMapHistory,
} from '../../../../src/editor/modules/history/mapHistory.ts'
import type { HistoryRecord } from '../../../../src/editor/modules/history/records.ts'

/**
 * A step of the test: a delete of the first faces.
 *
 * @param faces The faces the step takes out.
 *
 * @returns The record of the step.
 */
function recordOf(faces: number[]): HistoryRecord {
  return { version: 1, kind: 'deleteFaces', faces }
}

void describe('rememberMapHistory', () => {
  // the store is a module level singleton: every test starts from no map
  beforeEach(() => {
    mapHistoryRecords.value = new Map()
  })

  void it('keeps the steps of a map by the value of the map', () => {
    rememberMapHistory('arx:8', [recordOf([1, 2])])

    assert.deepEqual(historyOfMap('arx:8'), [recordOf([1, 2])])
    assert.deepEqual(historyOfMap('arx:11'), [])
  })

  void it('forgets a map that has no steps any more', () => {
    rememberMapHistory('arx:8', [recordOf([1])])
    rememberMapHistory('arx:8', [])

    assert.deepEqual(historyOfMap('arx:8'), [])
    assert.equal(mapHistoryRecords.value.has('arx:8'), false)
  })

  void it('copies the list, so the caller can not change the store', () => {
    const records = [recordOf([3])]

    rememberMapHistory('blank:flat', records)
    records.push(recordOf([4]))

    assert.equal(historyOfMap('blank:flat').length, 1)
  })
})
