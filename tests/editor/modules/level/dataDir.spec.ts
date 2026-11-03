import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DATA_DIR_PARAMETER,
  dataDirFromUrl,
  clearPickedDataDir,
  dataDirName,
  dataFileUrl,
  fetchDataFile,
  hasDataDir,
  readDataFile,
  setPickedDataDir,
} from '../../../../src/editor/modules/level/dataDir.ts'
import type { UrlAdapter } from '../../../../src/editor/modules/persistedRef/url.ts'

/**
 * A query string as the url of the page would give it.
 *
 * @param search The parameters, without the leading `?`.
 *
 * @returns The adapter the sources read.
 */
function urlOf(search: string): UrlAdapter {
  return {
    read: (): string => {
      return search
    },
    write: (): void => {
      // the test never writes
    },
  }
}

void describe('dataDirFromUrl', () => {
  void it('reads the folder of the game', () => {
    assert.equal(dataDirFromUrl(urlOf(`${DATA_DIR_PARAMETER}=/home/lali/arx/data`)), '/home/lali/arx/data')
    assert.equal(dataDirFromUrl(urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`)), 'https://example.com/data')
  })

  void it('says nothing when the parameter is missing or empty', () => {
    assert.equal(dataDirFromUrl(urlOf('')), undefined)
    assert.equal(dataDirFromUrl(urlOf(`${DATA_DIR_PARAMETER}=`)), undefined)
    assert.equal(dataDirFromUrl(urlOf(`${DATA_DIR_PARAMETER}=   `)), undefined)
    assert.equal(dataDirFromUrl(undefined), undefined)
  })
})

void describe('dataFileUrl', () => {
  void it('asks the development server for a folder of the disk', () => {
    assert.equal(
      dataFileUrl('/home/lali/arx/data', 'graph/levels/level8/fast.fts', true),
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=graph%2Flevels%2Flevel8%2Ffast.fts',
    )
    assert.equal(
      dataFileUrl('file:///home/lali/arx/data', 'graph/obj3d/textures/wall.jpg', true),
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=graph%2Fobj3d%2Ftextures%2Fwall.jpg',
    )
  })

  void it('takes a folder url as the base of the file', () => {
    assert.equal(
      dataFileUrl('https://example.com/data/', 'graph/levels/level8/fast.fts', true),
      'https://example.com/data/graph/levels/level8/fast.fts',
    )
    assert.equal(
      dataFileUrl('https://example.com/data', 'graph/levels/level8/fast.fts', false),
      'https://example.com/data/graph/levels/level8/fast.fts',
    )
  })

  void it('says why a folder of the disk needs the development server', () => {
    assert.throws(() => {
      return dataFileUrl('file:///home/lali/arx/data', 'graph/levels/level8/fast.fts', false)
    }, /needs its development server/u)
  })
})

void describe('fetchDataFile', () => {
  void it('reads the file where the data directory keeps it', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      // the workspace's own copy keeps the scene under game/: the plain path is a 404
      if (typeof input === 'string' && input.includes('game%2Fgraph%2Flevels')) {
        return new Response('fts')
      }

      return new Response(null, { status: 404 })
    }

    const bytes = await fetchDataFile('/home/lali/arx/data', 'graph/levels/level8/fast.fts', fetchImpl, true)

    assert.equal(new TextDecoder().decode(bytes), 'fts')
    assert.deepEqual(calls, [
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=graph%2Flevels%2Flevel8%2Ffast.fts',
      '/__local-data?root=%2Fhome%2Flali%2Farx%2Fdata&path=game%2Fgraph%2Flevels%2Flevel8%2Ffast.fts',
    ])
  })

  void it('walks the extensions of a texture on a folder served as a url', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      if (typeof input === 'string' && input.endsWith('.jpg')) {
        return new Response('jpg')
      }

      return new Response(null, { status: 404 })
    }

    const bytes = await fetchDataFile(
      'https://example.com/data',
      'graph/obj3d/textures/[glass]_windows2',
      fetchImpl,
      false,
    )

    assert.equal(new TextDecoder().decode(bytes), 'jpg')
    assert.equal(calls.length, 2)
    assert.equal(calls[1]?.endsWith('.jpg'), true)
  })

  void it('finds a texture the level names with another extension', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      // level 8 says `[stone]_human_castle_wall1.bmp`, the file of the game is a `.jpg`
      if (typeof input === 'string' && input.endsWith('human_castle_wall1.jpg')) {
        return new Response('jpg')
      }

      return new Response(null, { status: 404 })
    }

    const bytes = await fetchDataFile(
      'https://example.com/data',
      'graph/obj3d/textures/[stone]_human_castle_wall1.bmp',
      fetchImpl,
      false,
    )

    assert.equal(new TextDecoder().decode(bytes), 'jpg')
    // the stem is tried first, then the extensions: the name of the level is not a file of the folder
    assert.equal(calls[0]?.endsWith('human_castle_wall1'), true)
    assert.equal(calls[1]?.endsWith('human_castle_wall1.jpg'), true)
  })

  void it('gives nothing when the folder has none of the paths', async () => {
    async function fetchImpl(): Promise<Response> {
      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    assert.equal(await fetchDataFile('https://example.com/data', 'missing.fts', fetchImpl, false), undefined)
  })
})

void describe('the data directory the user picked', () => {
  void it('reads a file of the picked folder, by the stem of its name', async () => {
    setPickedDataDir(
      [
        { path: 'graph/obj3d/textures/[stone]_human_castle_wall1.jpg', file: new File(['jpg'], 'wall.jpg') },
        { path: 'graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') },
      ],
      'arx-data',
    )

    assert.equal(dataDirName(urlOf('')), 'arx-data')
    assert.equal(hasDataDir(urlOf('')), true)

    // the level says `.bmp`, the picked file is a `.jpg`: the stem is what matches
    const bytes = await readDataFile('graph/obj3d/textures/[stone]_human_castle_wall1.bmp')

    assert.equal(new TextDecoder().decode(bytes), 'jpg')
  })

  void it('reads nothing it does not have', async () => {
    const calls: string[] = []

    async function fetchImpl(input: string | URL | Request): Promise<Response> {
      if (typeof input === 'string') {
        calls.push(input)
      }

      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    // a picked folder is in the page: the url of the disk is not even asked for a file the folder does not have
    assert.equal(await readDataFile('graph/levels/level8/level8.dlf', fetchImpl), undefined)
    assert.deepEqual(calls, [])
  })

  void it('says nothing when neither the url nor the header has a folder', () => {
    clearPickedDataDir()

    assert.equal(dataDirName(urlOf('')), undefined)
    assert.equal(hasDataDir(urlOf('')), false)
  })
})
