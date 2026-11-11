import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  DATA_DIR_PARAMETER,
  dataDirFromUrl,
  clearPickedDataDir,
  dataDirName,
  fetchDataFile,
  forgetDataDir,
  hasDataDir,
  listDataDirTextures,
  readDataFile,
  setPickedDataDir,
  startDataDir,
  clearTextureScan,
  scanLevelNumbers,
  dataDirKind,
  dataDirPermission,
  dataDirState,
  requestDataDirPermission,
  setDataDirHandle,
  canReadDataDirOf,
} from '../../../../../src/editor/modules/level/source/dataDir.ts'
import type { DataDirHandleStore } from '../../../../../src/editor/modules/level/source/dataDirHandle.ts'
import { FAKE_DATA_DIR, fakeDirectoryHandle, fakePermissionHandle } from '../../../../support/fakeDirectory.ts'
import type { UrlAdapter } from '../../../../../src/editor/modules/persistedRef/url.ts'

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
    await setPickedDataDir(
      [
        { path: 'graph/obj3d/textures/[stone]_human_castle_wall1.jpg', file: new File(['jpg'], 'wall.jpg') },
        { path: 'graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') },
      ],
      'arx-data',
    )

    assert.equal(dataDirName(), 'arx-data')
    assert.equal(hasDataDir(), true)

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
    await setPickedDataDir(
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
    assert.equal(
      await startDataDir(urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`)),
      'https://example.com/data',
    )
    // a served folder: the path of the disk is only read by the development server, a url is a folder the host serves

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

    await forgetDataDir()
  })

  void it('says nothing when neither the url, the header nor the browser has a folder', () => {
    clearPickedDataDir()

    assert.equal(dataDirName(), undefined)
    assert.equal(hasDataDir(), false)
  })
})

void describe('the data directory of the url', () => {
  void it('takes the folder of the url for this visit, and keeps nothing of it', async () => {
    // the url of a link names a folder: it is the folder of the session, and nothing else remembers it
    assert.equal(
      await startDataDir(urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`)),
      'https://example.com/data',
    )
    assert.equal(dataDirKind.value, 'path')
    assert.equal(hasDataDir(), true)

    // a visit without the parameter has no folder: the editor keeps none of the disk in the browser
    await forgetDataDir()

    assert.equal(await startDataDir(urlOf('')), undefined)
    assert.equal(hasDataDir(), false)
  })

  void it('reads nothing without a folder anywhere', async () => {
    await forgetDataDir()

    assert.equal(await startDataDir(urlOf('')), undefined)
    assert.equal(dataDirName(), undefined)
  })
})

/**
 * A store of the test: it counts what the editor keeps and forgets.
 *
 * @param handle The folder the store gives back, when it has one.
 *
 * @returns The store, and the counters of it.
 */
function fakeStore(handle?: FileSystemDirectoryHandle): {
  store: DataDirHandleStore
  saved: () => number
  forgotten: () => number
} {
  let saves = 0
  let forgets = 0

  return {
    store: {
      load: async (): Promise<FileSystemDirectoryHandle | undefined> => {
        await Promise.resolve()

        return handle
      },
      save: async (): Promise<void> => {
        saves = saves + 1

        await Promise.resolve()
      },
      forget: async (): Promise<void> => {
        forgets = forgets + 1

        await Promise.resolve()
      },
    },
    saved: (): number => {
      return saves
    },
    forgotten: (): number => {
      return forgets
    },
  }
}

void describe('the data directory of the directory picker', () => {
  beforeEach(async () => {
    await forgetDataDir(fakeStore().store)
  })

  void it('reads a served url on any build, and a folder of the disk on the development server only', () => {
    // a url that serves the folder: the page reads it itself, so it is the same on every build
    assert.equal(canReadDataDirOf('https://example.com/data', false), true)
    assert.equal(canReadDataDirOf('https://example.com/data', true), true)

    // a folder of the disk: only the server that served the page can read it, and only on the machine of that folder
    assert.equal(canReadDataDirOf('/home/lali/arx-data', false), false)
    assert.equal(canReadDataDirOf('/home/lali/arx-data', true), true)
    assert.equal(canReadDataDirOf('file:///home/lali/arx-data', false), false)
    assert.equal(canReadDataDirOf('file:///home/lali/arx-data', true), true)

    // a windows drive path is not a shape the local route takes, and nothing is nothing
    assert.equal(canReadDataDirOf(String.raw`C:\Users\lali\unpacked`, true), false)
    assert.equal(canReadDataDirOf(' '.repeat(3), true), false)
  })

  void it('drops a path of the disk a site can not read, and keeps it on the development server', async () => {
    const url = urlOf(`${DATA_DIR_PARAMETER}=/home/lali/arx-data`)

    // the page of a site has no server of that machine behind it: the page can not read the folder, so the link is not
    // the data dir (and nothing remembers it)
    assert.equal(await startDataDir(url, fakeStore().store, false), undefined)
    assert.equal(hasDataDir(), false)

    assert.equal(await startDataDir(url, fakeStore().store, true), '/home/lali/arx-data')
    assert.equal(dataDirKind.value, 'path')
    assert.equal(hasDataDir(), true)
  })

  void it('takes the path of the url where the build can read it', async () => {
    const { store, forgotten } = fakeStore()
    const url = urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`)

    assert.equal(await startDataDir(url, store), 'https://example.com/data')
    assert.equal(dataDirKind.value, 'path')
    assert.equal(dataDirState.value, 'https://example.com/data')
    assert.equal(forgotten(), 1)
  })

  void it('drops a path of the url a site can not read', async () => {
    const url = urlOf(`${DATA_DIR_PARAMETER}=/home/lali/arx-data`)

    assert.equal(await startDataDir(url, fakeStore().store, false), undefined)
    assert.equal(dataDirState.value, undefined)
  })

  void it('takes the folder of the picker, and keeps the handle', async () => {
    const { store, saved } = fakeStore()

    await setDataDirHandle(fakeDirectoryHandle(FAKE_DATA_DIR), 'granted', store)

    assert.equal(dataDirKind.value, 'handle')
    assert.equal(dataDirState.value, 'data-dir')
    assert.equal(dataDirPermission.value, 'granted')
    assert.equal(saved(), 1)
    assert.equal(hasDataDir(), true)
  })

  void it('does not read a folder the browser blocks', async () => {
    await setDataDirHandle(fakeDirectoryHandle(FAKE_DATA_DIR), 'denied', fakeStore().store)

    assert.equal(dataDirKind.value, 'handle')
    assert.equal(dataDirPermission.value, 'denied')
    assert.equal(hasDataDir(), false)
  })

  void it('asks the browser for the permission of the remembered folder', async () => {
    const { store, saved } = fakeStore()
    const { handle, asked } = fakePermissionHandle('granted')

    await setDataDirHandle(handle, 'prompt', store)

    assert.equal(hasDataDir(), false)

    assert.equal(await requestDataDirPermission(store), 'granted')
    assert.equal(asked(), 1)
    assert.equal(saved(), 2)
    assert.equal(hasDataDir(), true)
  })

  void it('forgets every way of the folder', async () => {
    const { store, forgotten } = fakeStore()

    await setDataDirHandle(fakeDirectoryHandle(FAKE_DATA_DIR), 'granted', store)

    await forgetDataDir(store)

    assert.equal(dataDirKind.value, undefined)
    assert.equal(dataDirState.value, undefined)
    assert.equal(hasDataDir(), false)

    // the forget cleared the store once: the handle the picker kept is gone with it
    assert.equal(forgotten(), 1)
  })

  void it('keeps a picked folder for the session only', async () => {
    const { store, forgotten } = fakeStore()

    await setPickedDataDir(
      [{ path: 'graph/levels/level8/fast.fts', file: new File(['fts'], 'fast.fts') }],
      'arx-data',
      store,
    )

    assert.equal(dataDirKind.value, 'picked')
    assert.equal(dataDirState.value, 'arx-data')

    // the picked folder forgot the store of the picker (the path of the storage went with it)
    assert.equal(forgotten(), 1)
  })

  void it('starts from the url, and falls back to the folder of the browser', async () => {
    const url = urlOf(`${DATA_DIR_PARAMETER}=https://example.com/data`)
    const { handle } = fakePermissionHandle('granted')
    const fromUrl = fakeStore(handle)

    // the url wins over the remembered folder, and the handle is forgotten
    assert.equal(await startDataDir(url, fromUrl.store), 'https://example.com/data')
    assert.equal(fromUrl.forgotten(), 1)

    // without a url the remembered folder of the picker is the folder
    await forgetDataDir(fakeStore().store)

    assert.equal(await startDataDir(urlOf(''), fakeStore(handle).store), 'data-dir')
    assert.equal(dataDirKind.value, 'handle')
    assert.equal(dataDirPermission.value, 'granted')
    assert.equal(hasDataDir(), true)
  })

  void it('reads the files, the textures and the levels of the remembered folder', async () => {
    await setDataDirHandle(fakeDirectoryHandle(FAKE_DATA_DIR), 'granted', fakeStore().store)

    assert.equal(new TextDecoder().decode(await readDataFile('graph/levels/level8/fast.fts')), 'fts')
    assert.deepEqual(await listDataDirTextures(), ['[stone]_wall.bmp', 'spells/fire.jpg'])
    assert.deepEqual(await scanLevelNumbers(), [8])
  })

  void it('forgets the scans when the folder changes', async () => {
    await setDataDirHandle(fakeDirectoryHandle(FAKE_DATA_DIR), 'granted', fakeStore().store)
    assert.deepEqual(await scanLevelNumbers(), [8])

    // another folder, without levels: the scan of the first one is not the answer
    await setDataDirHandle(fakeDirectoryHandle({ folder: { graph: { folder: {} } } }), 'granted', fakeStore().store)

    assert.deepEqual(await scanLevelNumbers(), [])
    assert.deepEqual(await listDataDirTextures(), [])
  })
})
