import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { formatCount } from '../../../modules/format.ts'

/**
 * One row of the polygon inspector.
 */
export interface InspectorRow {
  /**
   * The name shown on the left.
   */
  readonly label: string
  /**
   * The text shown on the right.
   */
  readonly value: string
}

/**
 * The polygon the inspector describes: the face under the crosshair.
 */
export interface InspectedPolygon {
  /**
   * The index of the polygon in the level, the one the selection holds too.
   */
  readonly index: number
  /**
   * The polygon itself, as the FTS stores it.
   */
  readonly polygon: ArxPolygon
  /**
   * The name of its texture, or `undefined` when the level has no container with its id.
   */
  readonly textureName: string | undefined
}

/**
 * What a row shows when no face is under the crosshair.
 */
const NOTHING = '—'

/**
 * The rows of the widget, in the order it shows them.
 *
 * @remarks
 * The labels do not depend on the level: the widget keeps the same lines before and after a face arrives, so it
 * does not jump, and a test can read a row by its label.
 */
const ROW_LABELS: readonly string[] = ['Index', 'Shape', 'Texture', 'Area', 'Room', 'Flags']

/**
 * The bits of a polygon, in the order {@link ArxPolygonFlags} declares them.
 *
 * @remarks
 * Two of the flags are left out: `None` is the empty set, and `Quad` is the shape of the face, which has a row
 * of its own (a quad is a shape, not a property a reader has to decode from a list of bits).
 */
const FLAG_BITS: ReadonlyArray<{ readonly name: string; readonly bit: number }> = Object.entries(ArxPolygonFlags)
  .filter(([name, bit]) => {
    return bit !== 0 && name !== 'Quad'
  })
  .map(([name, bit]) => {
    return { name, bit }
  })

/**
 * The names of the flags a polygon holds.
 *
 * @param flags The flag bits of the polygon.
 *
 * @returns The names of the flags that are set, in the order of the flag list.
 */
export function flagNamesOf(flags: number): readonly string[] {
  return FLAG_BITS.filter((flag) => {
    return (flags & flag.bit) !== 0
  }).map((flag) => {
    return flag.name
  })
}

/**
 * Builds the rows of the polygon inspector.
 *
 * @remarks
 * The rows describe what the crosshair is on: the index the selection uses, the shape of the face, the texture it
 * draws with, its area in the units of the level, the room it belongs to (the FTS stores a room id on every
 * polygon, which the room round needs) and the flags, which decide how the game treats the face.
 *
 * @param inspected The face under the crosshair, or `undefined` when the ray hits nothing.
 *
 * @returns The rows, in the order the widget shows them.
 */
export function inspectorRows(inspected: InspectedPolygon | undefined): InspectorRow[] {
  if (inspected === undefined) {
    return ROW_LABELS.map((label) => {
      return { label, value: NOTHING }
    })
  }

  const { index, polygon, textureName } = inspected

  let shape = 'Triangle'

  if (isQuad(polygon)) {
    shape = 'Quad'
  }

  let texture = `#${String(polygon.textureContainerId)}`

  if (textureName !== undefined) {
    texture = textureName
  }

  let flags = flagNamesOf(polygon.flags).join(', ')

  if (flags === '') {
    flags = 'None'
  }

  return [
    { label: 'Index', value: String(index) },
    { label: 'Shape', value: shape },
    { label: 'Texture', value: texture },
    { label: 'Area', value: formatCount(Math.round(polygon.area)) },
    { label: 'Room', value: String(polygon.room) },
    { label: 'Flags', value: flags },
  ]
}
