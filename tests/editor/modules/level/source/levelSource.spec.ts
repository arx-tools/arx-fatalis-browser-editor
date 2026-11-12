import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createOriginalLevelSource,
  fetchLevelFiles,
  levelFileNames,
  levelFileUrls,
  loadStarterLevel,
  ORIGINAL_LEVEL_PARAMETER,
  originalLevelFromUrl,
  starterLevelSource,
  ZIP_URL_PARAMETER,
  zipUrlFromUrl,
} from '../../../../../src/editor/modules/level/source/levelSource.ts'
import { clearPickedDataDir, DATA_DIR_PARAMETER } from '../../../../../src/editor/modules/level/source/dataDir.ts'
import { isZipLevelSource } from '../../../../../src/editor/modules/level/source/zipSource.ts'
import type { UrlAdapter } from '../../../../../src/editor/modules/persistedRef/url.ts'

/**
 * A fake fetch which answers with the bytes of the url.
 *
 * @remarks
 * The response is a real `Response` (node has it), so it behaves like the one the browser gives back,
 * without a network.
 *
 * @param failOn `true` to answer with a 404 for every request.
 *
 * @returns The fake fetch and the urls it was called with.
 */
function fakeFetch(failOn = false): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = []

  async function fetchImpl(input: string): Promise<Response> {
    calls.push(input)

    // the body is the url itself, read through the response API the caller uses
    const body = await new Response(input).arrayBuffer()
    let status = 200
    let statusText = 'OK'

    if (failOn) {
      status = 404
      statusText = 'Not Found'
    }

    return new Response(body, { status, statusText })
  }

  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls }
}

void describe('levelFileNames', () => {
  void it('follows the naming of the game data', () => {
    assert.deepEqual(levelFileNames(11), { dlf: 'level11.dlf', fts: 'fast.fts', llf: 'level11.llf' })
  })
})

void describe('levelFileUrls', () => {
  void it('points at the pkware-test-files repository', () => {
    const urls = levelFileUrls(11)

    assert.ok(urls.fts.startsWith('https://raw.githubusercontent.com/arx-tools/pkware-test-files/'))
    assert.ok(urls.fts.endsWith('/arx-fatalis/level11/fast.fts'))
    assert.ok(urls.dlf.endsWith('/arx-fatalis/level11/level11.dlf'))
    assert.ok(urls.llf.endsWith('/arx-fatalis/level11/level11.llf'))
  })
})

void describe('fetchLevelFiles', () => {
  void it('downloads the three files', async () => {
    const { fetchImpl, calls } = fakeFetch()
    const files = await fetchLevelFiles(11, fetchImpl)

    assert.equal(calls.length, 3)
    // every buffer holds the url it came from, so the three landed in the right slot
    assert.equal(new TextDecoder().decode(files.dlf), levelFileUrls(11).dlf)
    assert.equal(new TextDecoder().decode(files.fts), levelFileUrls(11).fts)
    assert.equal(new TextDecoder().decode(files.llf), levelFileUrls(11).llf)
  })

  void it('fails when a file can not be downloaded', async () => {
    const { fetchImpl } = fakeFetch(true)

    await assert.rejects(fetchLevelFiles(11, fetchImpl), /Failed to download/u)
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

void describe('originalLevelFromUrl', () => {
  void it('reads the level the url asks for', () => {
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=8`)), 8)
    // the parameter sits between the others of the editor (the seed, the camera, the switches)
    assert.equal(originalLevelFromUrl(urlOf(`seed=1&${ORIGINAL_LEVEL_PARAMETER}=11&position=1,2,3`)), 11)
    // the original levels are numbered from 0
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=0`)), 0)
  })

  void it('ignores a url that names no level', () => {
    assert.equal(originalLevelFromUrl(urlOf('')), undefined)
    assert.equal(originalLevelFromUrl(urlOf('seed=1')), undefined)
  })

  void it('ignores a level which is not a whole number', () => {
    // a mistyped link is not a reason to fail a load
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=eleven`)), undefined)
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=1.5`)), undefined)
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=`)), undefined)
    assert.equal(originalLevelFromUrl(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=-1`)), undefined)
  })

  void it('has no url to read in node', () => {
    assert.equal(originalLevelFromUrl(undefined), undefined)
  })
})

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
    // the zip wins over the level parameter: it is the more specific thing a link can name
    assert.equal(starterLevelSource(urlOf(`${ZIP_URL_PARAMETER}=/a.zip&${ORIGINAL_LEVEL_PARAMETER}=8`)).label, 'a.zip')
  })

  void it('opens the original level the url names', () => {
    assert.equal(starterLevelSource(urlOf(`${ORIGINAL_LEVEL_PARAMETER}=8`)).label, 'Level 8')
  })

  void it('builds the flat floor of the blank level', async () => {
    const map = await loadStarterLevel(fetch, urlOf(''))

    // the Flat preset: 11×11 tiles of 100×100
    assert.equal(map.statistics.faceCount, 121)
  })

  void it('falls back to a blank level when the original one does not load', async () => {
    const { fetchImpl, calls } = fakeFetch(true)
    const map = await loadStarterLevel(fetchImpl, urlOf(`${ORIGINAL_LEVEL_PARAMETER}=8`))

    // without the folder of the game the level of the url is not downloaded (the site has no level without the folder),
    // and the editor still has something to show
    assert.equal(calls.length, 0)
    assert.equal(map.statistics.faceCount, 121)
  })
})

void describe('the level of the game without a folder', () => {
  void it('is not downloaded by a build that is not the development one', async () => {
    const { fetchImpl, calls } = fakeFetch(false)
    const source = createOriginalLevelSource(8, urlOf(''), false)

    await assert.rejects(
      (async (): Promise<unknown> => {
        return await source.load(fetchImpl)
      })(),
      /needs the Arx data dir/u,
    )
    assert.equal(calls.length, 0)
  })

  void it('is downloaded by the development build, which the tests and the probes use', async () => {
    const { fetchImpl, calls } = fakeFetch(false)
    const source = createOriginalLevelSource(8, urlOf(''), true)

    await source.load(fetchImpl)

    assert.equal(calls.length, 3)
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
