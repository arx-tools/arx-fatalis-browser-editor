import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MapStatistics } from '../../../../../src/generator/ArxMap.ts'
import { statisticsRows } from '../../../../../src/editor/components/widgets/StatisticsWidget/statistics.ts'

/**
 * The numbers of a small test level.
 */
const statistics: MapStatistics = {
  faceCount: 12_348,
  triangleCount: 2536,
  quadCount: 9812,
  lightCount: 47,
  anchorCount: 3,
  portalCount: 8,
}

void describe('statisticsRows', () => {
  void it('shows a pending value for every row while the level is loading', () => {
    const rows = statisticsRows(undefined)

    assert.equal(rows.length, 7)
    assert.deepEqual(
      rows.filter((row) => {
        return row.value !== '…'
      }),
      [],
    )
  })

  void it('shows the numbers of the loaded level', () => {
    assert.deepEqual(statisticsRows({ statistics }), [
      { label: 'Triangles', value: '2 536' },
      { label: 'Quads', value: '9 812' },
      { label: 'Total faces', value: '12 348' },
      { label: 'Selected faces', value: '0' },
      { label: 'Lights', value: '47' },
      { label: 'Anchors', value: '3' },
      { label: 'Portals', value: '8' },
    ])
  })

  void it('keeps the labels of the loading state', () => {
    const pending = statisticsRows(undefined).map((row) => {
      return row.label
    })
    const loaded = statisticsRows({ statistics }).map((row) => {
      return row.label
    })

    assert.deepEqual(pending, loaded)
  })
})

void describe('statisticsRows with a selection', () => {
  void it('counts the selected faces in the row under the total', () => {
    const rows = statisticsRows({ statistics }, 42)

    assert.deepEqual(rows[2], { label: 'Total faces', value: '12 348' })
    assert.deepEqual(rows[3], { label: 'Selected faces', value: '42' })
  })

  void it('keeps the row while the level is loading', () => {
    const rows = statisticsRows(undefined, 7)

    assert.deepEqual(rows[3], { label: 'Selected faces', value: '…' })
  })
})
