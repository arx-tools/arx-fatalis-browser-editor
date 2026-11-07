import type { MapStatistics } from '../../../../generator/ArxMap.ts'
import { formatCount } from '../../../modules/format.ts'

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
 * Builds the rows of the statistics widget from the loaded level.
 *
 * @remarks
 * The rows are the same before and after the level arrives, so the widget does not jump: while the map is
 * not there the value is a single `…`, and the labels are fixed here (not in the component), so the order
 * and the names are testable.
 *
 * The count of the **selected** faces is not here: it is about the selection and not about the level, so it lives in
 * the Selection Inspector, under the textures the selected faces draw with (2026-11-04, the owner).
 *
 * The **rooms** are the ones the level uses (the rooms a face belongs to): the file can carry more records, with the
 * reserved 0 and the gaps an edit leaves, and the author counts the areas they see.
 *
 * @param map The map of the loaded level, or `undefined` while it is loading.
 *
 * @returns The rows, in the order the widget shows them.
 */
export function mapStatisticsRows(
  map: { readonly statistics: MapStatistics; readonly roomCount: number } | undefined,
): StatisticsRow[] {
  if (map === undefined) {
    return [
      { label: 'Triangles', value: PENDING_VALUE },
      { label: 'Quads', value: PENDING_VALUE },
      { label: 'Total faces', value: PENDING_VALUE },
      { label: 'Lights', value: PENDING_VALUE },
      { label: 'Anchors', value: PENDING_VALUE },
      { label: 'Rooms', value: PENDING_VALUE },
      { label: 'Portals', value: PENDING_VALUE },
    ]
  }

  const { statistics } = map

  return [
    { label: 'Triangles', value: formatCount(statistics.triangleCount) },
    { label: 'Quads', value: formatCount(statistics.quadCount) },
    { label: 'Total faces', value: formatCount(statistics.faceCount) },
    { label: 'Lights', value: formatCount(statistics.lightCount) },
    { label: 'Anchors', value: formatCount(statistics.anchorCount) },
    { label: 'Rooms', value: formatCount(map.roomCount) },
    { label: 'Portals', value: formatCount(statistics.portalCount) },
  ]
}
