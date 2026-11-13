import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MANIFEST_NAME, manifestOf } from '../../src/generator/manifest.ts'

/**
 * The block of the editor the tests read back.
 */
const editor = {
  name: 'arx-fatalis-browser-editor',
  version: '0.23.1',
  commit: '99a2fff',
  builtAt: '2026-11-12',
  url: 'https://example.com/editor',
  exportedAt: '2026-11-12T20:30:00.000Z',
}

void describe('MANIFEST_NAME', () => {
  void it('is the name the generator and the loader of the zips share', () => {
    assert.equal(MANIFEST_NAME, 'manifest.json')
  })
})

void describe('manifestOf', () => {
  void it('reads nothing from a value that is not an object', () => {
    assert.equal(manifestOf(undefined), undefined)
    assert.equal(manifestOf(null), undefined)
    assert.equal(manifestOf('a manifest'), undefined)
    assert.equal(manifestOf([1, 2, 3]), undefined)
  })

  void it('reads an empty object as a manifest without keys', () => {
    assert.deepEqual(manifestOf({}), {
      seed: undefined,
      name: undefined,
      version: undefined,
      description: undefined,
      author: undefined,
      project: undefined,
      editor: undefined,
      files: undefined,
    })
  })

  void it('reads the keys of the level generator', () => {
    const manifest = manifestOf({
      seed: '12345',
      name: 'arx-map-lalees-minigame',
      version: '2.1.1',
      description: 'A map',
      author: { name: 'Lajos Meszaros' },
      project: { homepage: 'https://example.com/lali' },
      url: 'https://example.com/the-mod',
      files: ['/game/graph/levels/level1/fast.fts'],
    })

    assert.equal(manifest?.name, 'arx-map-lalees-minigame')
    assert.deepEqual(manifest?.author, { name: 'Lajos Meszaros' })
    assert.deepEqual(manifest?.project, { homepage: 'https://example.com/lali' })
    assert.equal(manifest?.seed, '12345')
    assert.deepEqual(manifest?.files, ['/game/graph/levels/level1/fast.fts'])
  })

  void it('keeps the strings of the files and drops the rest', () => {
    const manifest = manifestOf({ files: ['/a', 3, '/b', null] })

    assert.deepEqual(manifest?.files, ['/a', '/b'])
  })

  void it('drops a key of a kind this build does not read', () => {
    const manifest = manifestOf({ name: 42, seed: { value: 1 }, files: 'a list' })

    assert.equal(manifest?.name, undefined)
    assert.equal(manifest?.seed, undefined)
    assert.equal(manifest?.files, undefined)
  })

  void it('reads the url of an older manifest as the homepage of the project', () => {
    assert.deepEqual(manifestOf({ url: ' https://example.com/the-mod ' })?.project, {
      homepage: 'https://example.com/the-mod',
    })
  })

  void it('reads no project from a manifest without a page', () => {
    assert.equal(manifestOf({})?.project, undefined)
    assert.equal(manifestOf({ project: {} })?.project, undefined)
    assert.equal(manifestOf({ project: 42 })?.project, undefined)
  })

  void it('reads an author named in one string as the name of the author', () => {
    assert.deepEqual(manifestOf({ author: ' Lajos Meszaros <m_lajos@hotmail.com> ' })?.author, {
      name: 'Lajos Meszaros <m_lajos@hotmail.com>',
    })
  })

  void it('reads nothing from an author that names nobody', () => {
    assert.equal(manifestOf({ author: ' ' })?.author, undefined)
    assert.equal(manifestOf({ author: {} })?.author, undefined)
    assert.equal(manifestOf({ author: 42 })?.author, undefined)
  })

  void it('reads the block of the editor', () => {
    assert.deepEqual(manifestOf({ editor })?.editor, editor)
  })

  void it('drops a block of the editor that is not complete', () => {
    assert.equal(manifestOf({ editor: { name: 'an editor' } })?.editor, undefined)
    assert.equal(manifestOf({ editor: 'an editor' })?.editor, undefined)
  })
})
