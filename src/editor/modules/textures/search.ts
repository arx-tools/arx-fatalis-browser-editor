import { materialOf, textureKindOf, type TextureMaterial } from './material.ts'
import type { TextureEntry } from './textureEntry.ts'

/**
 * The group of the list a texture belongs to: the game's surfaces, the game's items, and the level's own.
 *
 * @remarks
 * The owner asked the filter to tell the game's **materials** and **items** apart (2026-11-04): the surfaces of a level
 * are the bracketed-material names (`[stone]_…`, `(fabric)_…`), and everything else of the game is an item
 * (`item_stone_riddle.jpg`, `aliciaroom_mur02.jpg`). The third group is the level's own (`Custom`), which is the zip of
 * the level, the placeholder of the generator and the files the user dropped.
 */
export type TextureGroup = 'arx-items' | 'arx-materials' | 'custom'

/**
 * The groups of the filter, in the order the widget shows them.
 */
export const TEXTURE_GROUPS: ReadonlyArray<{ readonly value: TextureGroup | 'all'; readonly label: string }> = [
  { value: 'all', label: 'All sources' },
  { value: 'arx-materials', label: 'Arx Fatalis materials' },
  { value: 'arx-items', label: 'Arx Fatalis items' },
  { value: 'custom', label: 'Custom' },
]

/**
 * Reads the group of a texture.
 *
 * @param entry The texture to look at.
 *
 * @returns The surface, the item or the custom group of the entry.
 */
export function groupOf(entry: TextureEntry): TextureGroup {
  if (entry.source === 'custom') {
    return 'custom'
  }

  if (textureKindOf(entry.name) === 'material') {
    return 'arx-materials'
  }

  return 'arx-items'
}

/**
 * What the texture list shows: the part of the entries a filter of the widget lets through.
 */
export interface TextureFilter {
  /**
   * What the user typed into the search field.
   */
  readonly query: string
  /**
   * The material the faces of the texture hear as, or `all`.
   */
  readonly material: TextureMaterial | 'all'
  /**
   * Where the texture comes from, or `all`.
   */
  readonly group: TextureGroup | 'all'
}

/**
 * The filter that lets every texture through.
 */
export const ANY_TEXTURE: TextureFilter = { query: '', material: 'all', group: 'all' }

/**
 * Whether a character of a name starts a word.
 *
 * @remarks
 * The names of the game's textures are put together with the marks of the file system (`[stone]_human_wall1.bmp`), and a
 * match at the beginning of a piece is worth more: a search for `wall` finds `[stone]_human_wall1.bmp` before a name
 * where the letters are only scattered.
 *
 * @param text The name the character is in.
 * @param index The place of the character.
 *
 * @returns True for the first character, and for one after a mark.
 */
function isWordStart(text: string, index: number): boolean {
  if (index === 0) {
    return true
  }

  const before = text.charAt(index - 1)

  return !/[0-9a-z]/iu.test(before)
}

/**
 * The score of one word of the search, or `undefined` when it is not in the text.
 *
 * @remarks
 * The letters have to come in the order they were typed (a subsequence), the way a fuzzy search of an editor works: `swl`
 * finds `[stone]_wall1.bmp`. A letter that follows the one before it, or that starts a piece of the name, is worth
 * more, and the whole word in the name (a substring) is worth most. The walk takes the **first** place a letter can go,
 * which is enough for the names of textures: they are short, and the order of the letters is what matters.
 *
 * @param word The word of the search, in lower case.
 * @param text The name of the texture, in lower case.
 *
 * @returns The score, or `undefined` when the word is not in the name.
 */
export function fuzzyScore(word: string, text: string): number | undefined {
  if (word === '') {
    return 0
  }

  let score = 0
  let from = 0
  let previous = -2

  for (const character of word) {
    const found = text.indexOf(character, from)

    if (found === -1) {
      return undefined
    }

    score = score + 1

    if (found === previous + 1) {
      score = score + 4
    }

    if (isWordStart(text, found)) {
      score = score + 3
    }

    previous = found
    from = found + 1
  }

  if (text.includes(word)) {
    score = score + 5
  }

  return score
}

/**
 * The score of a search, for the order of the list.
 *
 * @remarks
 * A search of more than one word is read as a list of words that every one of them has to be in the name (`stone wall`
 * finds `[stone]_human_wall1.bmp`), and the score of the name is the sum of their scores.
 *
 * @param query What the user typed.
 * @param name The name of the texture.
 *
 * @returns The score, 0 for an empty search, or `undefined` when the name does not match.
 */
export function searchScoreOf(query: string, name: string): number | undefined {
  const words = query
    .toLowerCase()
    .split(/\s+/u)
    .filter((word) => {
      return word !== ''
    })

  if (words.length === 0) {
    return 0
  }

  const text = name.toLowerCase()
  let score = 0

  for (const word of words) {
    const found = fuzzyScore(word, text)

    if (found === undefined) {
      return undefined
    }

    score = score + found
  }

  return score
}

/**
 * Whether an entry is what the filter asks for.
 *
 * @param entry The texture to look at.
 * @param filter What the user typed and chose.
 *
 * @returns True when the material, the source and the search all let it through.
 */
export function matchesFilter(entry: TextureEntry, filter: TextureFilter): boolean {
  if (filter.material !== 'all' && materialOf(entry.name) !== filter.material) {
    return false
  }

  if (filter.group !== 'all' && groupOf(entry) !== filter.group) {
    return false
  }

  return searchScoreOf(filter.query, entry.name) !== undefined
}

/**
 * The entries a filter lets through, in the order the list shows them.
 *
 * @remarks
 * Without a search the order of the catalog is kept (the level's own textures first, then the placeholder, then the
 * game's, each group in the order it arrived). A search sorts by its score, and names of the same score follow each
 * other alphabetically, so the list of a page does not change between two renders of the same search.
 *
 * @param entries The catalog of the level.
 * @param filter What the user typed and chose.
 *
 * @returns The entries to show, in order.
 */
export function filteredEntries(entries: readonly TextureEntry[], filter: TextureFilter): readonly TextureEntry[] {
  const kept = entries.filter((entry) => {
    return matchesFilter(entry, filter)
  })

  if (filter.query.trim() === '') {
    return kept
  }

  return kept.toSorted((one, other) => {
    const score = (searchScoreOf(filter.query, other.name) ?? 0) - (searchScoreOf(filter.query, one.name) ?? 0)

    if (score !== 0) {
      return score
    }

    return one.name.localeCompare(other.name)
  })
}
