import { formatCount } from '../../../modules/format.ts'
import { filteredEntries, type TextureFilter } from '../../../modules/textures/search.ts'
import type { TextureEntry } from '../../../modules/textures/textureEntry.ts'

/**
 * How many textures a page of the list holds.
 *
 * @remarks
 * The list of a data directory is a few thousand textures, so it is read a page at a time: a hundred tiles is a screen
 * of them at a size the eye can still tell apart, and a page of thumbnails is a hundred images to decode.
 */
export const TEXTURES_PER_PAGE = 100

/**
 * What a page of the texture list shows.
 */
export interface TexturePage {
  /**
   * The textures of the page, in the order of the list.
   */
  readonly entries: readonly TextureEntry[]
  /**
   * The page, counted from one.
   */
  readonly page: number
  /**
   * How many pages the filter leaves (at least one: an empty list is one empty page).
   */
  readonly pageCount: number
  /**
   * How many textures the filter lets through.
   */
  readonly total: number
  /**
   * The place of the first texture of the page in the filtered list, counted from one (0 for an empty list).
   */
  readonly from: number
  /**
   * The place of the last texture of the page in the filtered list, counted from one.
   */
  readonly to: number
  /**
   * The line under the list, like `1-100 of 2 468`.
   */
  readonly label: string
}

/**
 * Reads a page of the texture list.
 *
 * @remarks
 * The page number is clamped: a search that narrows the list while the user is on the last page lands on the last page
 * the search has, not on an empty one. An empty list is one page with nothing in it, so the line under the list says `0`
 * and the buttons are disabled (the widget does not jump).
 *
 * @param entries The catalog of the level.
 * @param filter What the user typed and chose.
 * @param page The page to show, counted from one.
 *
 * @returns The page of the list.
 */
export function texturePageOf(entries: readonly TextureEntry[], filter: TextureFilter, page: number): TexturePage {
  const filtered = filteredEntries(entries, filter)
  const pageCount = Math.max(1, Math.ceil(filtered.length / TEXTURES_PER_PAGE))
  const current = Math.min(Math.max(1, Math.trunc(page)), pageCount)
  const start = (current - 1) * TEXTURES_PER_PAGE
  const shown = filtered.slice(start, start + TEXTURES_PER_PAGE)

  const isEmpty = shown.length === 0
  const to = start + shown.length
  let from = start + 1
  let label = '0'

  if (isEmpty) {
    from = 0
  } else if (from === to) {
    // one texture is a page of one: a range of the same number twice reads worse than the count
    label = `${formatCount(from)} of ${formatCount(filtered.length)}`
  } else {
    label = `${formatCount(from)}-${formatCount(to)} of ${formatCount(filtered.length)}`
  }

  return { entries: shown, page: current, pageCount, total: filtered.length, from, to, label }
}
