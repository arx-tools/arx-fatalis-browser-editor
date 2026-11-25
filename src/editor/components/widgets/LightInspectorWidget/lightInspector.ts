import { ArxLightFlags, type ArxLight, type ArxVector3 } from 'arx-convert/types'
import type { CameraPose } from '../camera/cameraPose.ts'
import { jumpPoseOf } from '../camera/jumpPose.ts'
import { lightMarkerShapeOf, type LightMarkerShape } from '../shared/lightMarkers.ts'

/**
 * The two kinds of light of a level, in the order the list shows them.
 *
 * @remarks
 * The game bakes a **static** light into the palette of the level, and lights a **semi-dynamic** one at runtime: the
 * editor reads the second kind on the dynamic layer of the Lighting Controls. The list takes the same split, so the
 * torches and the candles of a level stand apart from the light the level carries (2026-11-24, the owner).
 */
export const LIGHT_SECTIONS = [
  { id: 'static', label: 'Static lights' },
  { id: 'dynamic', label: 'Dynamic lights' },
] as const

/**
 * The kind of a light in the list, which is the section it belongs to.
 */
export type LightSection = (typeof LIGHT_SECTIONS)[number]['id']

/**
 * Tells whether a light belongs to the dynamic layer.
 *
 * @remarks
 * The `SemiDynamic` flag is the one the game lights at runtime: the dynamic layer of the editor, the palette bake and the
 * `Dynamic lights` switch of the Lighting Controls all read it, so the list does too.
 *
 * @param light The light of the LLF.
 *
 * @returns True when the light is a semi-dynamic one.
 */
export function isDynamicLight(light: ArxLight): boolean {
  return (light.flags & ArxLightFlags.SemiDynamic) !== 0
}

/**
 * One row of the Light Inspector: a light of the level, as the list reads it.
 */
export type LightRow = {
  /**
   * The index of the light in `map.lights`, which names it: a light has no identifier of its own.
   */
  readonly index: number
  /**
   * The section of the list the light belongs to: the static one, or the dynamic layer.
   */
  readonly section: LightSection
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
    let section: LightSection = 'static'

    if (isDynamicLight(light)) {
      section = 'dynamic'
    }

    return {
      index,
      section,
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
 * How many entries the window of the list keeps above and below the visible ones.
 *
 * @remarks
 * A few entries make the next one ready before the scroll reaches it; more would mount the list again from the other
 * side.
 */
const OVERSCAN = 6

/**
 * The height of a row of the list, before the browser has measured one.
 */
export const LIGHT_ROW_HEIGHT_FALLBACK = 25

/**
 * The height of a section header, before the browser has measured one.
 */
export const LIGHT_HEADER_HEIGHT_FALLBACK = 24

/**
 * The rows of one section of the list: the word of its header, and the lights under it.
 */
export type LightSectionRows = {
  /**
   * The kind of the light the section holds.
   */
  readonly section: LightSection
  /**
   * The word of the header.
   */
  readonly label: string
  /**
   * The lights of the section, in the order of `map.lights`.
   */
  readonly rows: readonly LightRow[]
}

/**
 * How tall the two heights of the list are, in css pixels.
 */
export type LightListMetrics = {
  /**
   * The height of a light row.
   */
  readonly rowHeight: number
  /**
   * The height of a section header.
   */
  readonly headerHeight: number
}

/**
 * Groups the rows into the sections of the list.
 *
 * @param rows The rows the search and the shape filter let through.
 *
 * @returns The two sections, in the order the list draws them.
 */
export function lightSectionsOf(rows: readonly LightRow[]): LightSectionRows[] {
  return LIGHT_SECTIONS.map((section) => {
    return {
      section: section.id,
      label: section.label,
      rows: rows.filter((row) => {
        return row.section === section.id
      }),
    }
  })
}

/**
 * The top of the header of every section, in css pixels, from the top of the list.
 *
 * @remarks
 * The headers and the rows of the sections above sit in the flow of the list, so the place of a section is the sum of
 * them: the reveal of a selection and the window of a section both read this. A folded section keeps its header and
 * loses its rows, so the section under it moves up by the height of the rows it had.
 *
 * @param sections The sections of the list, in the order the list draws them.
 * @param metrics The measured heights of the list.
 * @param isOpen Whether the rows of a section are shown.
 *
 * @returns The top of each section, by its kind.
 */
export function lightSectionTopsOf(
  sections: readonly LightSectionRows[],
  metrics: LightListMetrics,
  isOpen: (section: LightSection) => boolean,
): Record<LightSection, number> {
  const tops: Record<LightSection, number> = { static: 0, dynamic: 0 }
  let top = 0

  for (const section of sections) {
    tops[section.section] = top
    top = top + metrics.headerHeight

    if (isOpen(section.section)) {
      const height = section.rows.length * metrics.rowHeight

      top = top + height
    }
  }

  return tops
}

/**
 * The rows a window of one section draws, and the room the rows above and below it take.
 */
export type LightRowWindow = {
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
 * Works out the window of the rows of a section a scroll box draws.
 *
 * @remarks
 * A level of a few hundred lights (level 0 has 376) mounts every row and its tooltips when the list draws them all, which
 * is the hitch of the Lighter preset. The list draws the rows the box shows, plus a few on both sides, and the two
 * paddings keep the height of the whole section on the scrollbar: the scrollbar is the same, the number of the live rows
 * is not (TODO 281). The headers of the sections are always in the flow (they stick to the top of the box), so the
 * window of a section is read from the scroll the section's own rows have: the header and the sections above it are
 * taken away from the scroll of the box before this call.
 *
 * @param total How many rows the section has.
 * @param scrollTop How far the box is scrolled past the first row of the section, in css pixels.
 * @param viewportHeight How tall the box is, in css pixels.
 * @param rowHeight How tall a light row is, in css pixels.
 *
 * @returns The first and the last row of the window, with the room of the rows outside it.
 */
export function lightRowWindowOf(
  total: number,
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
): LightRowWindow {
  if (total <= 0 || rowHeight <= 0) {
    return { start: 0, end: 0, top: 0, bottom: 0 }
  }

  const first = Math.max(0, Math.floor(scrollTop / rowHeight))
  const start = Math.min(Math.max(0, first - OVERSCAN), Math.max(0, total - 1))
  const last = Math.ceil((Math.max(scrollTop, 0) + Math.max(viewportHeight, 0)) / rowHeight) + OVERSCAN
  const end = Math.min(total, Math.max(start, last))

  return {
    start,
    end,
    top: start * rowHeight,
    bottom: (total - end) * rowHeight,
  }
}

/**
 * Works out the scroll of the box that puts an entry of the list on the screen.
 *
 * @remarks
 * A row that is already in the box is left where it is: a click of the author in the list does not jump the list around.
 * The box is positioned once, without an animation, so the row is there on the frame it is asked for (2026-11-24, the
 * owner).
 *
 * @param top The place of the top of the entry from the top of the list, in css pixels.
 * @param height The height of the entry, in css pixels.
 * @param scrollTop How far the box is scrolled now, in css pixels.
 * @param viewportHeight How tall the box is, in css pixels.
 *
 * @returns The scroll the box takes.
 */
export function revealScrollTopOf(top: number, height: number, scrollTop: number, viewportHeight: number): number {
  if (viewportHeight <= 0) {
    return Math.max(0, top)
  }

  if (top < scrollTop) {
    return Math.max(0, top)
  }

  if (top + height > scrollTop + viewportHeight) {
    return top + height - viewportHeight
  }

  return scrollTop
}
