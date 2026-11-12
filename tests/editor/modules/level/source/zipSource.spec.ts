import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import JSZip from 'jszip'
import {
  createZipLevelSource,
  createZipUrlLevelSource,
  readLevelFromZip,
  zipFetchUrl,
} from '../../../../../src/editor/modules/level/source/zipSource.ts'

/**
 * Builds a zip in memory.
 *
 * @remarks
 * The three files of a level do not have to be real ones: the reader unpacks them and hands the bytes over, the parsing
 * is the generator's. So a test file is a few bytes with a name, and what the test asserts is which bytes came out.
 *
 * @param files The path of every file and its content.
 *
 * @returns The bytes of the zip.
 */
async function zipOf(files: Record<string, string>): Promise<ArrayBuffer> {
  const archive = new JSZip()

  for (const [path, content] of Object.entries(files)) {
    archive.file(path, content)
  }

  return await archive.generateAsync({ type: 'arraybuffer' })
}

/**
 * Reads the bytes of a level file as text.
 *
 * @param data The bytes.
 *
 * @returns The text of the file.
 */
function textOf(data: ArrayBuffer): string {
  return new TextDecoder().decode(data)
}

/**
 * The three files of a level at the paths the game installs them to.
 *
 * @param level The name of the level folder: `level1`.
 * @param mark What the content of the files says, so a test can tell them apart.
 *
 * @returns The files of the zip.
 */
function installedLevel(level: string, mark: string): Record<string, string> {
  return {
    [`game/graph/levels/${level}/fast.fts`]: `fts-${mark}`,
    [`graph/levels/${level}/${level}.dlf`]: `dlf-${mark}`,
    [`graph/levels/${level}/${level}.llf`]: `llf-${mark}`,
    'graph/obj3d/textures/[wood]-floor.jpg': 'jpg',
    'sfx/click.wav': 'wav',
  }
}

void describe('readLevelFromZip', () => {
  void it('reads the three files of a level from the paths of the game', async () => {
    const level = await readLevelFromZip(await zipOf(installedLevel('level8', 'a')), 'level8.zip')

    assert.equal(textOf(level.files.fts), 'fts-a')
    assert.equal(textOf(level.files.dlf), 'dlf-a')
    assert.equal(textOf(level.files.llf), 'llf-a')
  })

  void it('keeps the name of the zip when the zip has no manifest', async () => {
    const level = await readLevelFromZip(await zipOf(installedLevel('level8', 'a')), 'arena.zip')

    assert.equal(level.manifest, undefined)
    assert.equal(level.label, 'arena.zip')
  })

  void it('reads the manifest and takes its name for the level', async () => {
    const files = {
      ...installedLevel('level1', 'a'),
      'manifest.json': JSON.stringify({ name: 'Lalee minigame', version: '2.1.1', author: 'Lali', seed: 42 }),
    }
    const level = await readLevelFromZip(await zipOf(files), 'minigame.zip')

    assert.equal(level.label, 'Lalee minigame')
    assert.equal(level.manifest?.version, '2.1.1')
    assert.equal(level.manifest?.author, 'Lali')
    assert.equal(level.manifest?.seed, 42)
  })

  void it('does not take the backup copy of a level file', async () => {
    const files = {
      ...installedLevel('level1', 'a'),
      'graph/levels/level1/level1.llf.bak': 'llf-backup',
    }
    const level = await readLevelFromZip(await zipOf(files), 'arena.zip')

    assert.equal(textOf(level.files.llf), 'llf-a')
  })

  void it('takes the level file the name of the scene asks for', async () => {
    const files = {
      'graph/levels/level7/level7.dlf': 'dlf-7',
      'graph/levels/level7/level7.llf': 'llf-7',
      'game/graph/levels/level7/fast.fts': 'fts-7',
      'graph/levels/level8/level8.dlf': 'dlf-8',
      'graph/levels/level8/level8.llf': 'llf-8',
      'game/graph/levels/level8/fast.fts': 'fts-8',
    }
    const level = await readLevelFromZip(await zipOf(files), 'two-levels.zip')

    assert.equal(textOf(level.files.fts), 'fts-7')
    assert.equal(textOf(level.files.dlf), 'dlf-7')
    assert.equal(textOf(level.files.llf), 'llf-7')
  })

  void it('takes the level the manifest lists over a copy of it', async () => {
    const files = {
      ...installedLevel('level8', 'good'),
      'backup/fast.fts': 'fts-copy',
      'backup/level8.dlf': 'dlf-copy',
      'backup/level8.llf': 'llf-copy',
      'manifest.json': JSON.stringify({
        name: 'The eighth',
        files: [
          '/home/lali/maps/eighth/game/graph/levels/level8/fast.fts',
          '/home/lali/maps/eighth/graph/levels/level8/level8.dlf',
          '/home/lali/maps/eighth/graph/levels/level8/level8.llf',
        ],
      }),
    }
    const level = await readLevelFromZip(await zipOf(files), 'with-a-copy.zip')

    // the paths of the manifest are absolute machine paths; the base names are what match the zip
    assert.equal(textOf(level.files.fts), 'fts-good')
    assert.equal(textOf(level.files.dlf), 'dlf-good')
    assert.equal(textOf(level.files.llf), 'llf-good')
  })

  void it('finds a level that is not under the levels folder', async () => {
    const files = { 'fast.fts': 'fts-root', 'level.dlf': 'dlf-root', 'level.llf': 'llf-root' }
    const level = await readLevelFromZip(await zipOf(files), 'flat.zip')

    assert.equal(textOf(level.files.fts), 'fts-root')
    assert.equal(textOf(level.files.dlf), 'dlf-root')
    assert.equal(textOf(level.files.llf), 'llf-root')
  })

  void it('says what is missing from a zip without a scene', async () => {
    const files = { 'graph/levels/level1/level1.dlf': 'dlf', 'graph/levels/level1/level1.llf': 'llf' }

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await readLevelFromZip(await zipOf(files), 'broken.zip')
      })(),
      /broken\.zip has no \.fts file/u,
    )
  })

  void it('says what is missing from a zip without a description', async () => {
    const files = { 'game/graph/levels/level1/fast.fts': 'fts', 'graph/levels/level1/level1.llf': 'llf' }

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await readLevelFromZip(await zipOf(files), 'broken.zip')
      })(),
      /broken\.zip has no \.dlf file/u,
    )
  })

  void it('says what is missing from a zip without a lighting file', async () => {
    const files = { 'game/graph/levels/level1/fast.fts': 'fts', 'graph/levels/level1/level1.dlf': 'dlf' }

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await readLevelFromZip(await zipOf(files), 'broken.zip')
      })(),
      /broken\.zip has no \.llf file/u,
    )
  })

  void it('says when the file is not a zip at all', async () => {
    const notAZip = new TextEncoder().encode('this is not a zip')

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await readLevelFromZip(notAZip.buffer, 'note.txt')
      })(),
      /note\.txt is not a zip/u,
    )
  })
})

void describe('createZipLevelSource', () => {
  void it('has no manifest before the zip is read', () => {
    const source = createZipLevelSource('level8.zip', new ArrayBuffer(0))

    assert.equal(source.manifest(), undefined)
  })

  void it('keeps the manifest the zip carries, once the level is loaded', async () => {
    const camera = { position: [100, 200, 300], rotation: [0, 90, 0] }
    const files = {
      ...installedLevel('level8', 'a'),
      'manifest.json': JSON.stringify({ name: 'Lalee minigame', seed: 42, camera }),
    }
    const source = createZipLevelSource('level8.zip', await zipOf(files))

    await source.load()

    assert.equal(source.manifest()?.name, 'Lalee minigame')
    assert.deepEqual(source.manifest()?.camera, camera)
  })

  void it('reads the zip when the level is loaded', async () => {
    const source = createZipLevelSource('level8.zip', await zipOf(installedLevel('level8', 'a')))
    const files = await source.load()

    assert.equal(source.label, 'level8.zip')
    assert.equal(textOf(files.fts), 'fts-a')
    assert.equal(textOf(files.dlf), 'dlf-a')
    assert.equal(textOf(files.llf), 'llf-a')
  })
})

void describe('zipFetchUrl', () => {
  void it('takes a url the browser can fetch as it is', () => {
    assert.equal(zipFetchUrl('https://example.com/x.zip', true), 'https://example.com/x.zip')
    assert.equal(zipFetchUrl('https://example.com/x.zip', false), 'https://example.com/x.zip')
    assert.equal(zipFetchUrl('levels/x.zip', true), 'levels/x.zip')
  })

  void it('asks the development server for a file of the disk', () => {
    // the browser can not read a file url of a page served over http: the server of the editor serves it instead
    assert.equal(zipFetchUrl('file:///home/lali/maps/x.zip', true), '/__local-zip?path=%2Fhome%2Flali%2Fmaps%2Fx.zip')
    assert.equal(zipFetchUrl('/home/lali/maps/x.zip', true), '/__local-zip?path=%2Fhome%2Flali%2Fmaps%2Fx.zip')
  })

  void it('says why a file url can not be read without the development server', () => {
    assert.throws(() => {
      return zipFetchUrl('file:///home/lali/maps/x.zip', false)
    }, /needs its development server/u)
    // a plain path of the site is a url there: only a file url names a file for sure
    assert.equal(zipFetchUrl('/editor/maps/x.zip', false), '/editor/maps/x.zip')
  })
})

void describe('createZipUrlLevelSource', () => {
  void it('downloads the zip and reads the level out of it', async () => {
    const data = await zipOf(installedLevel('level8', '8'))
    // the development server serves the files of the disk; the tests take that side, node has no dev server
    const source = createZipUrlLevelSource('file:///home/lali/x.zip', true)
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      // the test asks for the url the source built, and it builds strings
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response(data)
    }

    assert.equal(source.label, 'x.zip')
    assert.equal(source.data(), undefined)

    const files = await source.load(fetchImpl)

    assert.deepEqual(calls, ['/__local-zip?path=%2Fhome%2Flali%2Fx.zip'])
    assert.deepEqual([textOf(files.dlf), textOf(files.fts), textOf(files.llf)], ['dlf-8', 'fts-8', 'llf-8'])
    assert.equal(source.data()?.byteLength, data.byteLength)
  })

  void it('says why a download failed', async () => {
    const source = createZipUrlLevelSource('https://example.com/x.zip')

    async function fetchImpl(): Promise<Response> {
      await Promise.resolve()

      return new Response(null, { status: 404, statusText: 'Not Found' })
    }

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await source.load(fetchImpl)
      })(),
      /Failed to download https:\/\/example\.com\/x\.zip: 404 Not Found/u,
    )
    assert.equal(source.data(), undefined)
  })
})
