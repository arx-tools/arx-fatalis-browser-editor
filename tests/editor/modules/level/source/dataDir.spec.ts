import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DATA_DIR_PARAMETER,
  dataDirFromUrl,
  clearPickedDataDir,
  dataDirName,
  dataFileUrl,
  fetchDataFile,
  forgetDataDir,
  hasDataDir,
  listDataDirTextures,
  readDataFile,
  rememberDataDir,
  setPickedDataDir,
  startDataDir,
  storedDataDir,
  clearTextureScan,
} from '../../../../../src/editor/modules/level/source/dataDir.ts'
import type { StorageLike } from '../../../../../src/editor/modules/persistedRef/storage.ts'
import type { UrlAdapter } from '../../../../../src/editor/modules/persistedRef/url.ts'

/**
 * A storage of the test: the local storage of the browser, in memory.
 *
 * @returns The storage, empty.
 */
function memoryStorage(): StorageLike {
  const values = new Map<string, string>()

  return {
    getItem: (key: string): string | null => {
      return values.get(key) ?? null
    },
    setItem: (key: string, value: string): void => {
      values.set(key, value)
    },
    removeItem: (key: string): void => {
      values.delete(key)
    },
  }
}

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

    assert.equal(dataDirName(memoryStorage()), 'arx-data')
    assert.equal(hasDataDir(memoryStorage()), true)

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

  void it('lists the textures of the picked folder, by the names a level calls them', async () => {
    setPickedDataDir(
      [
        { path: 'graph/obj3d/textures/[stone]_human_castle_wall1.jpg', file: new File(['jpg'], 'wall.jpg') },
        { path: 'graph/obj3d/textures/spells/fire.bmp', file: new File(['bmp'], 'fire.bmp') },
        { path: 'graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') },
        { path: 'graph/obj3d/textures/readme.txt', file: new File(['txt'], 'readme.txt') },
      ],
      'arx-data',
    )

    // the level's own files and the files that are not images stay out, and the subfolder is in the name: the game reads
    // a texture of `spells/` by that path
    assert.deepEqual(await listDataDirTextures(), ['[stone]_human_castle_wall1.jpg', 'spells/fire.bmp'])

    // a folder of the url is listed by the server, and the names come as it says them
    clearPickedDataDir()
    clearTextureScan()
    // a served folder: the path of the disk is only read by the development server, a url is a folder the host serves
    rememberDataDir('http://localhost:5557/arx-data', undefined)

    async function fetchImpl(): Promise<Response> {
      await Promise.resolve()

      return Response.json({ textures: ['b.bmp', 'a.bmp'] }, { status: 200 })
    }

    assert.deepEqual(await listDataDirTextures(fetchImpl, true), ['a.bmp', 'b.bmp'])

    // and a folder that can not be listed (a served one) gives an empty list, not an error
    async function notFound(): Promise<Response> {
      await Promise.resolve()

      return new Response(null, { status: 404 })
    }

    clearTextureScan()

    assert.deepEqual(await listDataDirTextures(notFound, true), [])

    forgetDataDir(undefined)
  })

  void it('says nothing when neither the url, the header nor the browser has a folder', () => {
    clearPickedDataDir()

    const storage = memoryStorage()

    assert.equal(dataDirName(storage), undefined)
    assert.equal(hasDataDir(storage), false)
  })
})

void describe('the data directory of the browser', () => {
  void it('remembers the folder of the url, and reads it back', () => {
    const storage = memoryStorage()

    // the url of a link names a folder: it is remembered, so the next visit does not need the parameter (a folder of
    // the disk is the development server's; in node a folder url is what the tests have)
    assert.equal(
      startDataDir(urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`), storage),
      'https://example.com/data',
    )
    assert.equal(storedDataDir(storage), 'https://example.com/data')

    // the next visit has nothing in the url: the folder comes from the browser
    assert.equal(startDataDir(urlOf(''), storage), 'https://example.com/data')
    assert.equal(hasDataDir(storage), true)
  })

  void it('forgets the folder', () => {
    const storage = memoryStorage()

    rememberDataDir('https://example.com/data', storage)
    forgetDataDir(storage)

    assert.equal(storedDataDir(storage), undefined)
    assert.equal(hasDataDir(storage), false)
  })

  void it('reads nothing without a folder anywhere', () => {
    const storage = memoryStorage()

    assert.equal(storedDataDir(storage), undefined)
    assert.equal(startDataDir(urlOf(''), storage), undefined)
  })
})
