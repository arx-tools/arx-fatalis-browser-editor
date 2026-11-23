import type { ArxLight, ArxVector3 } from 'arx-convert/types'
import type { CameraPose } from '../camera/cameraPose.ts'
import { jumpPoseOf } from '../camera/jumpPose.ts'
import { lightMarkerShapeOf, type LightMarkerShape } from '../shared/lightMarkers.ts'

/**
 * One row of the Light Inspector: a light of the level, as the list reads it.
 */
export type LightRow = {
  /**
   * The index of the light in `map.lights`, which names it: a light has no identifier of its own.
   */
  readonly index: number
  /**
   * The shape the marker of the light draws with.
   */
  readonly shape: LightMarkerShape
  /**
   * The place of the light in the game's coordinates (the LLF position and the scene of the level).
   */
  readonly position: ArxVector3
  /**
   * The color of the light, as a css hex, for the swatch of the row.
   */
  readonly color: string
}

/**
 * What the list shows of the shape of a light, in the words of the panel.
 *
 * @remarks
 * The words are the owner's (2026-11-17): the static lights and the semi-dynamic ones, the fire, and the light that is
 * off. They say the same thing the shape of the marker does, so the list and the view read the same kind.
 *
 * @param shape The shape of the marker.
 *
 * @returns The label of the row.
 */
export function lightShapeLabelOf(shape: LightMarkerShape): string {
  switch (shape) {
    case 'star': {
      return 'Static'
    }

    case 'bulb': {
      return 'Semi-dynamic'
    }

    case 'flame': {
      return 'Fire'
    }

    case 'flameCrossed': {
      return 'Off'
    }
  }
}

/**
 * How far the camera stands from a light it jumps to.
 *
 * @remarks
 * The owner asked for 300 units (2026-11-18): the light is in the middle of the walkable view, and the camera keeps
 * the orientation it had, so the author sees the light from the side they were looking from.
 */
export const LIGHT_JUMP_DISTANCE = 300

/**
 * The label of a light in the list: its name, the index in `map.lights`.
 *
 * @remarks
 * The label is a word and a number, not a `#` and a padded number: the digits of the font are not monospace, so the
 * padding lined the rows up only by accident. The row gives the field a fixed width instead (2026-11-18, the owner).
 *
 * @param index The index of the light in `map.lights`.
 *
 * @returns The `light` and the number.
 */
export function lightIndexLabelOf(index: number): string {
  return `light ${index}`
}

/**
 * The pose the camera takes to look at a light.
 *
 * @remarks
 * The orientation of the camera is the one it has: the jump only moves the camera, so the light lands in the middle of
 * the view it already looks toward, at {@link LIGHT_JUMP_DISTANCE} units. The light is a row of the list, which
 * carries the place in the game's coordinates.
 *
 * @param pose The pose of the camera.
 * @param light The light to look at.
 *
 * @returns The pose of the camera, with the light in the middle of the view.
 */
export function lightJumpPoseOf(pose: CameraPose, light: LightRow): CameraPose {
  return jumpPoseOf(pose, light.position, LIGHT_JUMP_DISTANCE)
}

/**
 * The place of a light, as the list writes it.
 *
 * @param position The place in the game's coordinates.
 *
 * @returns The three numbers, one decimal each, with a comma between them.
 */
export function lightPositionLabelOf(position: ArxVector3): string {
  return `${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`
}

/**
 * The two digit hex of one channel of a color.
 *
 * @param value The channel, from 0 to 255.
 *
 * @returns The channel in hex, two digits.
 */
function channelOf(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0')
}

/**
 * The color of a light, as a css hex.
 *
 * @param light The light of the LLF.
 *
 * @returns The `#rrggbb` of the light, from the 0..255 channels.
 */
function lightColorOf(light: ArxLight): string {
  return `#${channelOf(light.color.r)}${channelOf(light.color.g)}${channelOf(light.color.b)}`
}

/**
 * Builds the rows of the Light Inspector.
 *
 * @param lights The lights of the LLF.
 * @param scene The scene position of the level, which the game coordinates of the light add to.
 *
 * @returns One row per light, in the order of `map.lights`.
 */
export function lightRowsOf(lights: readonly ArxLight[], scene: ArxVector3): LightRow[] {
  return lights.map((light, index) => {
    return {
      index,
      shape: lightMarkerShapeOf(light),
      position: {
        x: light.position.x + scene.x,
        y: light.position.y + scene.y,
        z: light.position.z + scene.z,
      },
      color: lightColorOf(light),
    }
  })
}

/**
 * What a row matches in the search.
 *
 * @param row The row of the list.
 *
 * @returns The text the search is looked for in.
 */
function searchTextOf(row: LightRow): string {
  return `light ${row.index} #${row.index} ${lightShapeLabelOf(row.shape)} ${lightPositionLabelOf(row.position)}`.toLowerCase()
}

/**
 * The rows the search and the shape filter let through.
 *
 * @param rows The rows of the list.
 * @param query What the author typed into the search field.
 * @param shape The shape to show, or `all` for every shape.
 *
 * @returns The rows that match both.
 */
export function filteredLightRows(
  rows: readonly LightRow[],
  query: string,
  shape: 'all' | LightMarkerShape,
): LightRow[] {
  const needle = query.trim().toLowerCase()

  return rows.filter((row) => {
    if (shape !== 'all' && row.shape !== shape) {
      return false
    }

    return needle === '' || searchTextOf(row).includes(needle)
  })
}

/**
 * How many rows the window of the list keeps above and below the visible ones.
 *
 * @remarks
 * A few rows make the next one ready before the scroll reaches it; more would mount the list again from the other side.
 */
const OVERSCAN = 6

/**
 * The rows a window of the list draws, and the room the rows above and below it take.
 */
export type LightWindow = {
  /**
   * The first row of the window.
   */
  readonly start: number
  /**
   * The row after the last one of the window.
   */
  readonly end: number
  /**
   * The height the rows above the window take, in css pixels.
   */
  readonly top: number
  /**
   * The height the rows below the window take, in css pixels.
   */
  readonly bottom: number
}

/**
 * Works out the window of the rows a scroll box draws.
 *
 * @remarks
 * A level of a few hundred lights (level 0 has 376) mounts every row and its tooltips when the list draws them all,
 * which is the hitch of the Lighter preset. The list draws the rows the box shows, plus a few on both sides, and the
 * two paddings keep the height of the whole list on the scrollbar: the scrollbar is the same, the number of the live
 * rows is not (TODO 281).
 *
 * @param total How many rows the list has.
 * @param scrollTop How far the box is scrolled, in css pixels.
 * @param viewportHeight How tall the box is, in css pixels.
 * @param rowHeight How tall a row is, in css pixels.
 *
 * @returns The first and the last row of the window, with the room of the rows outside it.
 */
export function lightWindowOf(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): LightWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, top: 0, bottom: 0 }
  }

  const first = Math.floor(scrollTop / rowHeight) - OVERSCAN
  const start = Math.max(0, Math.min(first, total - 1))
  const last = Math.ceil((scrollTop + viewportHeight) / rowHeight) + OVERSCAN
  const end = Math.min(total, Math.max(start, last))

  return {
    start,
    end,
    top: start * rowHeight,
    bottom: (total - end) * rowHeight,
  }
}

/**
 * What the panel says above the list: how many lights there are, and how many of them are selected.
 *
 * @param total How many lights the level has.
 * @param selected How many of them the selection holds.
 *
 * @returns The line of the panel.
 */
export function lightSelectionLabelOf(total: number, selected: number): string {
  let noun = 'lights'

  if (total === 1) {
    noun = 'light'
  }

  const lights = `${total} ${noun}`

  if (selected === 0) {
    return lights
  }

  return `${lights} · ${selected} selected`
}
