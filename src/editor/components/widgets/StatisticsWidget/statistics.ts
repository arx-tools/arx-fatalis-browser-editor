import type { MapStatistics } from '../../../../generator/ArxMap.ts'

/**
 * One row of the statistics widget.
 */
export interface StatisticsRow {
  /**
   * The name shown on the left.
   */
  readonly label: string
  /**
   * The number shown on the right, already formatted.
   */
  readonly value: string
}

/**
 * What the widget shows while the level is on its way.
 */
const PENDING_VALUE = '…'

/**
 * Writes a count the way the widget shows it: a space between every three digits.
 *
 * @remarks
 * The grouping is spelled out instead of `toLocaleString`, so the rows are the same in the browser and in
 * the tests (the locale of the browser and of the test runner are not necessarily the same).
 *
 * @param value The count to write.
 *
 * @returns The number, grouped with spaces.
 */
export function formatCount(value: number): string {
  const digits = Math.trunc(Math.abs(value)).toString()
  let grouped = ''

  // the digits are walked from the right, so a space goes before every third one
  for (const [index, digit] of [...digits].toReversed().entries()) {
    if (index > 0 && index % 3 === 0) {
      grouped = ` ${grouped}`
    }

    grouped = `${digit}${grouped}`
  }

  if (value < 0) {
    return `-${grouped}`
  }

  return grouped
}

/**
 * Builds the rows of the statistics widget from the loaded level.
 *
 * @remarks
 * The rows are the same before and after the level arrives, so the widget does not jump: while the map is
 * not there the value is a single `…`, and the labels are fixed here (not in the component), so the order
 * and the names are testable.
 *
 * @param map The map of the loaded level, or `undefined` while it is loading.
 * @param selected The number of selected polygons: a quad counts as one.
 *
 * @returns The rows, in the order the widget shows them.
 */
export function statisticsRows(map: { readonly statistics: MapStatistics } | undefined, selected = 0): StatisticsRow[] {
  if (map === undefined) {
    return [
      { label: 'Triangles', value: PENDING_VALUE },
      { label: 'Quads', value: PENDING_VALUE },
      { label: 'Total faces', value: PENDING_VALUE },
      { label: 'Selected faces', value: PENDING_VALUE },
      { label: 'Lights', value: PENDING_VALUE },
      { label: 'Anchors', value: PENDING_VALUE },
      { label: 'Portals', value: PENDING_VALUE },
    ]
  }

  const { statistics } = map

  return [
    { label: 'Triangles', value: formatCount(statistics.triangleCount) },
    { label: 'Quads', value: formatCount(statistics.quadCount) },
    { label: 'Total faces', value: formatCount(statistics.polygonCount) },
    // the selection belongs right under the total: it is the same count, of a part of the level
    { label: 'Selected faces', value: formatCount(selected) },
    { label: 'Lights', value: formatCount(statistics.lightCount) },
    { label: 'Anchors', value: formatCount(statistics.anchorCount) },
    { label: 'Portals', value: formatCount(statistics.portalCount) },
  ]
}
