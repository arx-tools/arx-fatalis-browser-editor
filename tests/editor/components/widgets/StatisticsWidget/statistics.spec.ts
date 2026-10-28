import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MapStatistics } from '../../../../../src/generator/ArxMap.ts'
import {
  formatCount,
  statisticsRows,
} from '../../../../../src/editor/components/widgets/StatisticsWidget/statistics.ts'

/**
 * The numbers of a small test level.
 */
const statistics: MapStatistics = {
  polygonCount: 12_348,
  texturedPolygonCount: 9812,
  lightCount: 47,
  anchorCount: 3,
  portalCount: 8,
}

void describe('formatCount', () => {
  void it('writes a small number as it is', () => {
    assert.equal(formatCount(8), '8')
    assert.equal(formatCount(0), '0')
  })

  void it('groups the digits by three with a space', () => {
    assert.equal(formatCount(9812), '9 812')
    assert.equal(formatCount(12_348), '12 348')
    assert.equal(formatCount(1_234_567), '1 234 567')
  })

  void it('keeps a negative sign', () => {
    assert.equal(formatCount(-1234), '-1 234')
  })

  void it('drops the fraction of a count', () => {
    assert.equal(formatCount(1234.7), '1 234')
  })
})

void describe('statisticsRows', () => {
  void it('shows a pending value for every row while the level is loading', () => {
    const rows = statisticsRows(undefined)

    assert.equal(rows.length, 5)
    assert.deepEqual(
      rows.filter((row) => {
        return row.value !== '…'
      }),
      [],
    )
  })

  void it('shows the numbers of the loaded level', () => {
    assert.deepEqual(statisticsRows({ statistics }), [
      { label: 'Polygon count', value: '12 348' },
      { label: 'Textured polygons', value: '9 812' },
      { label: 'Light count', value: '47' },
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
