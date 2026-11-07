import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MapStatistics } from '../../../../../src/generator/ArxMap.ts'
import { mapStatisticsRows } from '../../../../../src/editor/components/widgets/MapStatisticsWidget/mapStatistics.ts'

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

void describe('mapStatisticsRows', () => {
  void it('shows a pending value for every row while the level is loading', () => {
    const rows = mapStatisticsRows(undefined)

    assert.equal(rows.length, 7)
    assert.deepEqual(
      rows.filter((row) => {
        return row.value !== '…'
      }),
      [],
    )
  })

  void it('shows the numbers of the loaded level', () => {
    assert.deepEqual(mapStatisticsRows({ statistics, roomCount: 73 }), [
      { label: 'Triangles', value: '2 536' },
      { label: 'Quads', value: '9 812' },
      { label: 'Total faces', value: '12 348' },
      { label: 'Lights', value: '47' },
      { label: 'Anchors', value: '3' },
      { label: 'Rooms', value: '73' },
      { label: 'Portals', value: '8' },
    ])
  })

  void it('keeps the labels of the loading state', () => {
    const pending = mapStatisticsRows(undefined).map((row) => {
      return row.label
    })
    const loaded = mapStatisticsRows({ statistics, roomCount: 73 }).map((row) => {
      return row.label
    })

    assert.deepEqual(pending, loaded)
  })
})
