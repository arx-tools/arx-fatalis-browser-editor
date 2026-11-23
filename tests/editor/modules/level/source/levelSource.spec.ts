import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createOriginalLevelSource,
  levelFileNames,
  loadStarterLevel,
  starterLevelSource,
  ZIP_URL_PARAMETER,
  zipUrlFromUrl,
} from '../../../../../src/editor/modules/level/source/levelSource.ts'
import {
  clearPickedDataDir,
  DATA_DIR_PARAMETER,
  setPickedDataDir,
} from '../../../../../src/editor/modules/level/source/dataDir.ts'
import { isZipLevelSource } from '../../../../../src/editor/modules/level/source/zipSource.ts'
import type { UrlAdapter } from '../../../../../src/editor/modules/persistedRef/url.ts'

void describe('levelFileNames', () => {
  void it('follows the naming of the game data', () => {
    assert.deepEqual(levelFileNames(11), { dlf: 'level11.dlf', fts: 'fast.fts', llf: 'level11.llf' })
  })
})

/**
 * A url the test gives to the level reader.
 *
 * @param search The query string, without the leading `?`.
 *
 * @returns The adapter the reader asks for its parameters.
 */
function urlOf(search: string): UrlAdapter {
  return {
    read: (): string => {
      return search
    },
    write: (): void => {
      // the reader never writes: the level of the url is an input, not a value the editor keeps there
      throw new Error('the level reader must not write the url')
    },
  }
}

void describe('zipUrlFromUrl', () => {
  void it('reads the url of the zip', () => {
    assert.equal(
      zipUrlFromUrl(urlOf(`${ZIP_URL_PARAMETER}=file:///home/lali/maps/x.zip`)),
      'file:///home/lali/maps/x.zip',
    )
    assert.equal(zipUrlFromUrl(urlOf(`${ZIP_URL_PARAMETER}=https://example.com/x.zip`)), 'https://example.com/x.zip')
  })

  void it('says nothing when the parameter is missing or empty', () => {
    assert.equal(zipUrlFromUrl(urlOf('')), undefined)
    assert.equal(zipUrlFromUrl(urlOf('seed=1')), undefined)
    // an empty parameter is not a path: it says nothing, like the level parameter
    assert.equal(zipUrlFromUrl(urlOf(`${ZIP_URL_PARAMETER}=`)), undefined)
    assert.equal(zipUrlFromUrl(urlOf(`${ZIP_URL_PARAMETER}=   `)), undefined)
    assert.equal(zipUrlFromUrl(undefined), undefined)
  })

  void it('trims the value', () => {
    assert.equal(zipUrlFromUrl(urlOf(`${ZIP_URL_PARAMETER}=%20file:///a.zip%20`)), 'file:///a.zip')
  })
})

void describe('starterLevelSource', () => {
  void it('opens a blank level when the url names no level', () => {
    // the editor starts from a floor to build on, not from a level of the game
    assert.equal(starterLevelSource(urlOf('')).label, 'Blank level')
    assert.equal(starterLevelSource(urlOf('seed=1&position=1,2,3')).label, 'Blank level')
  })

  void it('opens the zip the url names', () => {
    const source = starterLevelSource(urlOf(`${ZIP_URL_PARAMETER}=file:///home/lali/maps/lalees.zip`))

    assert.equal(source.label, 'lalees.zip')
    assert.equal(isZipLevelSource(source), true)
  })

  void it('builds the flat floor of the blank level', async () => {
    const map = await loadStarterLevel(fetch, urlOf(''))

    // the Flat preset: 11×11 tiles of 100×100
    assert.equal(map.statistics.faceCount, 121)
  })
})

void describe('the level of the game without a folder', () => {
  void it('is not downloaded: every build needs the data directory', async () => {
    const source = createOriginalLevelSource(8, urlOf(''))
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await source.load(fetchImpl)
      })(),
      /needs the Arx data dir/u,
    )

    assert.deepEqual(calls, [])
  })
})

void describe('the level of a data directory', () => {
  void it('reads the three files of the level from the folder of the game', async () => {
    // the header may have picked a folder in another test: this one reads the url
    clearPickedDataDir()

    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response('bytes')
    }

    const source = createOriginalLevelSource(8, urlOf(`${DATA_DIR_PARAMETER}=/home/lali/arx/data`))
    const files = await source.load(fetchImpl)

    // no network: every file comes from the data directory of the url (in node there is no development server, so the
    // folder is the base url; the browser takes the route of the server)
    assert.deepEqual(calls.toSorted(), [
      '/home/lali/arx/data/graph/levels/level8/fast.fts',
      '/home/lali/arx/data/graph/levels/level8/level8.dlf',
      '/home/lali/arx/data/graph/levels/level8/level8.llf',
    ])
    assert.equal(new TextDecoder().decode(files.fts), 'bytes')
  })

  void it('says why a data directory without the level can not open it', async () => {
    clearPickedDataDir()

    async function fetchImpl(): Promise<Response> {
      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    const source = createOriginalLevelSource(8, urlOf(`${DATA_DIR_PARAMETER}=/home/lali/arx/data`))

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await source.load(fetchImpl)
      })(),
      /has no level 8/u,
    )
  })
})

void describe('the level of the folder picked in the header', () => {
  void it('opens the level of the picked folder without the url', async () => {
    await setPickedDataDir(
      [
        { path: 'graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') },
        { path: 'graph/levels/level8/level8.dlf', file: new File(['dlf'], 'level8.dlf') },
        { path: 'graph/levels/level8/level8.llf', file: new File(['llf'], 'level8.llf') },
      ],
      'arx-data',
    )

    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    const source = createOriginalLevelSource(8, urlOf(''))
    const files = await source.load(fetchImpl)

    assert.equal(new TextDecoder().decode(files.fts), 'fts')
    // the folder of the page is the level: nothing is downloaded for it
    assert.deepEqual(calls, [])

    clearPickedDataDir()
  })

  void it('reads the scene of a demo level from game/graph/levels too', async () => {
    // the extracted demo keeps the scene in game/graph/levels and the other two files in graph/levels
    await setPickedDataDir(
      [
        { path: 'game/graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') },
        { path: 'graph/levels/level8/level8.dlf', file: new File(['dlf'], 'level8.dlf') },
        { path: 'graph/levels/level8/level8.llf', file: new File(['llf'], 'level8.llf') },
      ],
      'demo-data',
    )

    const source = createOriginalLevelSource(8, urlOf(''))
    const files = await source.load()

    assert.equal(new TextDecoder().decode(files.fts), 'fts')
    assert.equal(new TextDecoder().decode(files.dlf), 'dlf')
    assert.equal(new TextDecoder().decode(files.llf), 'llf')

    clearPickedDataDir()
  })
})
