import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ANY_TEXTURE } from '../../../../../src/editor/modules/textures/search.ts'
import type { TextureEntry } from '../../../../../src/editor/modules/textures/textureEntry.ts'
import {
  TEXTURES_PER_PAGE,
  texturePageOf,
} from '../../../../../src/editor/components/widgets/TextureBrowserWidget/textureBrowser.ts'

/**
 * Builds a list of textures, none of them like another.
 *
 * @param count How many textures the list holds.
 * @param nameOf The name of one texture, by its place.
 * @param source Where the textures come from, `arx` by default.
 *
 * @returns The entries.
 */
function textures(
  count: number,
  nameOf = (index: number): string => {
    return `[stone]_wall${String(index)}.bmp`
  },
  source: TextureEntry['source'] = 'arx',
): TextureEntry[] {
  return Array.from({ length: count }, (_, index) => {
    return { source, name: nameOf(index) }
  })
}

void describe('texturePageOf', () => {
  void it('shows a hundred textures a page', () => {
    assert.equal(TEXTURES_PER_PAGE, 100)
  })

  void it('counts the pages of the list', () => {
    const page = texturePageOf(textures(250), ANY_TEXTURE, 1)

    assert.equal(page.pageCount, 3)
    assert.equal(page.entries.length, 100)
    assert.equal(page.from, 1)
    assert.equal(page.to, 100)
    assert.equal(page.total, 250)
  })

  void it('slices the page asked for', () => {
    const page = texturePageOf(textures(250), ANY_TEXTURE, 3)

    assert.equal(page.page, 3)
    assert.equal(page.entries.length, 50)
    assert.equal(page.from, 201)
    assert.equal(page.to, 250)
  })

  void it('writes the range with the counts of the editor', () => {
    assert.equal(texturePageOf(textures(250), ANY_TEXTURE, 1).label, '1–100 of 250')
    assert.equal(texturePageOf(textures(2468), ANY_TEXTURE, 2).label, '101–200 of 2 468')
  })

  void it('lands on the last page when the filter makes the list shorter', () => {
    const page = texturePageOf(textures(250), { ...ANY_TEXTURE, query: 'wall1' }, 9)

    assert.equal(page.page, page.pageCount)
    assert.ok(page.entries.length > 0)
  })

  void it('writes a page of one texture as the count itself', () => {
    assert.equal(texturePageOf(textures(1), ANY_TEXTURE, 1).label, '1 of 1')
  })

  void it('keeps one empty page for an empty list', () => {
    const page = texturePageOf([], ANY_TEXTURE, 4)

    assert.equal(page.pageCount, 1)
    assert.equal(page.page, 1)
    assert.equal(page.label, '0')
    assert.deepEqual(page.entries, [])
    assert.equal(page.from, 0)
    assert.equal(page.to, 0)
  })

  void it('pages the list a filter left', () => {
    const custom = textures(
      150,
      (index) => {
        return `custom-${String(index)}.png`
      },
      'custom',
    )
    const page = texturePageOf([...textures(250), ...custom], { ...ANY_TEXTURE, group: 'custom' }, 2)

    assert.equal(page.pageCount, 2)
    assert.equal(page.page, 2)
    assert.equal(page.total, 150)
    assert.equal(page.label, '101–150 of 150')
  })
})
