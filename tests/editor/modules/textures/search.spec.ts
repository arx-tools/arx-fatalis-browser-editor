import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ANY_TEXTURE,
  filteredEntries,
  fuzzyScore,
  groupOf,
  matchesFilter,
  searchScoreOf,
} from '../../../../src/editor/modules/textures/search.ts'
import type { TextureEntry } from '../../../../src/editor/modules/textures/textureEntry.ts'

/**
 * Builds an entry of the texture list: a name, and where the texture comes from.
 *
 * @param name What the level calls the file, like `[stone]_wall1.bmp`.
 * @param source Where it comes from, `arx` by default.
 *
 * @returns The texture of the list, with the source the filter reads.
 */
function entry(name: string, source: TextureEntry['source'] = 'arx'): TextureEntry {
  return { name, source }
}

void describe('fuzzyScore', () => {
  void it('finds the letters in their order, scattered in the name', () => {
    assert.notEqual(fuzzyScore('swl', '[stone]_wall1.bmp'), undefined)
    assert.notEqual(fuzzyScore('wall1', '[stone]_wall1.bmp'), undefined)
  })

  void it('gives nothing when a letter of the word is not in the name', () => {
    assert.equal(fuzzyScore('swlx', '[stone]_wall1.bmp'), undefined)
  })

  void it('gives an empty word the score of zero', () => {
    assert.equal(fuzzyScore('', '[stone]_wall1.bmp'), 0)
  })

  void it('scores a word that starts a piece of the name higher', () => {
    const word = fuzzyScore('wall', '[stone]_wall1.bmp') ?? 0
    const scattered = fuzzyScore('wall', 'w-a-l-l-scattered.bmp') ?? 0

    assert.ok(word > scattered)
  })

  void it('scores the whole word in the name the highest', () => {
    const word = fuzzyScore('wall1', '[stone]_wall1.bmp') ?? 0
    const letters = fuzzyScore('wall1', '[stone]_w_a_l_l_1.bmp') ?? 0

    assert.ok(word > letters)
  })
})

void describe('searchScoreOf', () => {
  void it('reads every word of the search, in any order in the name', () => {
    assert.notEqual(searchScoreOf('stone wall', '[stone]_human_wall1.bmp'), undefined)
    assert.notEqual(searchScoreOf('wall stone', '[stone]_human_wall1.bmp'), undefined)
  })

  void it('needs every word of the search', () => {
    assert.equal(searchScoreOf('stone ceiling', '[stone]_human_wall1.bmp'), undefined)
  })

  void it('gives an empty search the score of zero', () => {
    assert.equal(searchScoreOf(' '.repeat(3), '[stone]_wall1.bmp'), 0)
  })
})

void describe('matchesFilter', () => {
  void it('lets every texture through by default', () => {
    assert.equal(matchesFilter(entry('[stone]_wall1.bmp'), ANY_TEXTURE), true)
    assert.equal(matchesFilter(entry('any.png', 'custom'), ANY_TEXTURE), true)
  })

  void it('filters by material, with the aliases of the game', () => {
    const stone = { ...ANY_TEXTURE, material: 'stone' as const }

    assert.equal(matchesFilter(entry('[stone]_wall1.bmp'), stone), true)
    assert.equal(matchesFilter(entry('[rock]_wall2.bmp'), stone), true)
    assert.equal(matchesFilter(entry('[wood]_door.bmp'), stone), false)
  })

  void it('filters by group: the surfaces of the game, its items and the own textures of the level', () => {
    const custom = { ...ANY_TEXTURE, group: 'custom' as const }
    const materials = { ...ANY_TEXTURE, group: 'arx-materials' as const }
    const items = { ...ANY_TEXTURE, group: 'arx-items' as const }

    assert.equal(matchesFilter(entry('mine.png', 'custom'), custom), true)
    assert.equal(matchesFilter(entry('[stone]_wall1.bmp'), custom), false)
    assert.equal(matchesFilter(entry('[stone]_wall1.bmp'), materials), true)
    assert.equal(matchesFilter(entry('item_stone_riddle.jpg'), materials), false)
    assert.equal(matchesFilter(entry('item_stone_riddle.jpg'), items), true)
    assert.equal(matchesFilter(entry('mine.png', 'custom'), items), false)
  })

  void it('filters by the search as well', () => {
    const filter = { ...ANY_TEXTURE, query: 'wall' }

    assert.equal(matchesFilter(entry('[stone]_wall1.bmp'), filter), true)
    assert.equal(matchesFilter(entry('[wood]_door.bmp'), filter), false)
  })
})

void describe('groupOf', () => {
  void it('reads the group of an entry', () => {
    assert.equal(groupOf(entry('[stone]_wall1.bmp')), 'arx-materials')
    assert.equal(groupOf(entry('item_amulet_red.bmp')), 'arx-items')
    assert.equal(groupOf(entry('jorge-[stone].jpg', 'custom')), 'custom')
  })
})

void describe('filteredEntries', () => {
  const catalog: readonly TextureEntry[] = [
    entry('[stone]_wall1.bmp'),
    entry('jorge-[stone].jpg', 'custom'),
    entry('[wood]_door.bmp'),
    entry('[stone]_floor.bmp'),
  ]

  void it('keeps the order of the catalog without a search', () => {
    assert.deepEqual(
      filteredEntries(catalog, ANY_TEXTURE).map((item) => {
        return item.name
      }),
      ['[stone]_wall1.bmp', 'jorge-[stone].jpg', '[wood]_door.bmp', '[stone]_floor.bmp'],
    )
  })

  void it('puts the names the search matches best first', () => {
    const found = filteredEntries(catalog, { ...ANY_TEXTURE, query: 'stone floor' })

    assert.deepEqual(
      found.map((item) => {
        return item.name
      }),
      ['[stone]_floor.bmp'],
    )
  })

  void it('follows the score with the name, so two pages of a search are stable', () => {
    const found = filteredEntries(catalog, { ...ANY_TEXTURE, query: 'stone' })

    assert.deepEqual(
      found.map((item) => {
        return item.name
      }),
      ['[stone]_floor.bmp', '[stone]_wall1.bmp', 'jorge-[stone].jpg'],
    )
  })
})
