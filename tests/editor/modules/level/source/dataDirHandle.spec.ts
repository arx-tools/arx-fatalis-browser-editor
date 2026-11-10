import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createHandleStore,
  directoryInDirectory,
  directoryPickerOf,
  entryInDirectory,
  fileInDirectory,
  levelNumbersInDirectory,
  permissionOf,
  pickDirectory,
  requestPermissionOf,
  textureNamesInDirectory,
} from '../../../../../src/editor/modules/level/source/dataDirHandle.ts'
import { FAKE_DATA_DIR, fakeDirectoryHandle, fakePermissionHandle } from '../../../../support/fakeDirectory.ts'

/**
 * The data directory of the tests, as the page sees it.
 */
const DATA_DIR = fakeDirectoryHandle(FAKE_DATA_DIR)

void describe('entryInDirectory', () => {
  void it('finds a path without the case of the names', async () => {
    assert.notEqual(await entryInDirectory(DATA_DIR, 'graph/levels/level8/fast.fts'), undefined)
    assert.notEqual(await entryInDirectory(DATA_DIR, 'GRAPH/LEVELS/LEVEL8/FAST.FTS'), undefined)
  })

  void it('gives nothing for a path the folder does not have', async () => {
    assert.equal(await entryInDirectory(DATA_DIR, 'graph/levels/level1/fast.fts'), undefined)
    assert.equal(await entryInDirectory(DATA_DIR, 'fast.fts/graph'), undefined)
  })
})

void describe('fileInDirectory', () => {
  void it('reads the bytes of a file', async () => {
    const file = await fileInDirectory(DATA_DIR, 'graph/levels/level8/fast.fts')
    let text = ''

    if (file !== undefined) {
      text = await file.text()
    }

    assert.equal(text, 'fts')
  })

  void it('gives nothing for a folder and for a file the folder does not have', async () => {
    assert.equal(await fileInDirectory(DATA_DIR, 'graph/levels/level8'), undefined)
    assert.equal(await fileInDirectory(DATA_DIR, 'graph/levels/level1/fast.fts'), undefined)
  })
})

void describe('directoryInDirectory', () => {
  void it('finds a folder without the case of the name', async () => {
    const folder = await directoryInDirectory(DATA_DIR, 'graph/obj3d/textures/spells')

    assert.equal(folder?.name, 'spells')
    assert.equal(await directoryInDirectory(DATA_DIR, 'graph/obj3d/textures/notes.txt'), undefined)
  })
})

void describe('textureNamesInDirectory', () => {
  void it('lists the images of the folder of the textures, with the subfolders and in lower case', async () => {
    assert.deepEqual(await textureNamesInDirectory(DATA_DIR), ['[stone]_wall.bmp', 'spells/fire.jpg'])
  })

  void it('gives nothing for a folder without textures', async () => {
    assert.equal(await textureNamesInDirectory(fakeDirectoryHandle({ folder: { graph: { folder: {} } } })), undefined)
  })
})

void describe('levelNumbersInDirectory', () => {
  void it('lists the folders that have the three files of a level', async () => {
    // level 9 has only the scene: it is not a level the editor can open
    assert.deepEqual(await levelNumbersInDirectory(DATA_DIR), [8])
  })

  void it('gives nothing for a folder without levels', async () => {
    assert.equal(await levelNumbersInDirectory(fakeDirectoryHandle({ folder: {} })), undefined)
  })
})

void describe('permissionOf', () => {
  void it('reads the permission of the browser without asking the user', async () => {
    const granted = fakePermissionHandle('granted')
    const prompt = fakePermissionHandle('prompt')
    const denied = fakePermissionHandle('denied')
    const grantedPermission = await permissionOf(granted.handle)
    const promptPermission = await permissionOf(prompt.handle)
    const deniedPermission = await permissionOf(denied.handle)

    assert.deepEqual([grantedPermission, promptPermission, deniedPermission], ['granted', 'prompt', 'denied'])
    assert.deepEqual([granted.asked(), prompt.asked(), denied.asked()], [0, 0, 0])
  })

  void it('reads a handle without the permission part as granted', async () => {
    assert.equal(await permissionOf(DATA_DIR), 'granted')
  })

  void it('asks the user for the permission, from the press of the button', async () => {
    const { handle, asked } = fakePermissionHandle('granted')

    assert.equal(await requestPermissionOf(handle), 'granted')
    assert.equal(asked(), 1)
  })
})

void describe('the picker of the browser', () => {
  void it('is the one of the page, or nothing when the browser has none', () => {
    const global = globalThis as { showDirectoryPicker?: () => unknown }
    const previous = global.showDirectoryPicker

    try {
      delete global.showDirectoryPicker

      assert.equal(directoryPickerOf(), undefined)

      async function picker(): Promise<FileSystemDirectoryHandle> {
        await Promise.resolve()

        return DATA_DIR
      }

      global.showDirectoryPicker = picker

      assert.equal(directoryPickerOf(), picker)
    } finally {
      global.showDirectoryPicker = previous
    }
  })

  void it('gives nothing when the user closes the picker of the page', async () => {
    async function cancelled(): Promise<FileSystemDirectoryHandle> {
      await Promise.resolve()

      throw new Error('the user cancelled the picker')
    }

    assert.equal(await pickDirectory(cancelled), undefined)
  })
})

/**
 * A request of the fake IndexedDB: the result of it, and the listeners the store adds.
 */
interface FakeRequest {
  readonly result: unknown
  addEventListener(type: string, listener: () => void): void
}

/**
 * Builds the fake IndexedDB of a test: one store, one key, in memory.
 *
 * @returns The factory, and the value the store holds.
 */
function fakeIndexedDb(): { factory: IDBFactory; stored: () => unknown } {
  let value: unknown

  function requestOf(result: unknown): FakeRequest {
    const listeners: Array<() => void> = []

    queueMicrotask(() => {
      for (const listener of listeners) {
        listener()
      }
    })

    return {
      result,
      addEventListener: (_type: string, listener: () => void): void => {
        listeners.push(listener)
      },
    }
  }

  const store = {
    get: (): FakeRequest => {
      return requestOf(value)
    },
    put: (entry: unknown): FakeRequest => {
      value = entry

      return requestOf(undefined)
    },
    delete: (): FakeRequest => {
      value = undefined

      return requestOf(undefined)
    },
  }

  const database = {
    objectStoreNames: {
      contains: (): boolean => {
        return true
      },
    },
    createObjectStore: (): void => {
      // the store exists already
    },
    transaction: (): { objectStore: () => typeof store } => {
      return {
        objectStore: (): typeof store => {
          return store
        },
      }
    },
    close: (): void => {
      // nothing to close
    },
  }

  const factory = {
    open: (): FakeRequest => {
      const listeners: Array<() => void> = []
      const request = {
        result: database,
        addEventListener: (_type: string, listener: () => void): void => {
          listeners.push(listener)

          queueMicrotask(() => {
            for (const each of listeners) {
              each()
            }
          })
        },
      }

      return request
    },
  }

  return {
    factory: factory as unknown as IDBFactory,
    stored: (): unknown => {
      return value
    },
  }
}

void describe('createHandleStore', () => {
  void it('keeps a folder, and reads it back', async () => {
    const { factory, stored } = fakeIndexedDb()
    const store = createHandleStore(factory)

    await store.save(DATA_DIR)

    assert.equal(stored(), DATA_DIR)
    assert.equal(await store.load(), DATA_DIR)
  })

  void it('forgets the folder', async () => {
    const { factory, stored } = fakeIndexedDb()
    const store = createHandleStore(factory)

    await store.save(DATA_DIR)
    await store.forget()

    assert.equal(stored(), undefined)
    assert.equal(await store.load(), undefined)
  })

  void it('keeps nothing without an IndexedDB', async () => {
    const store = createHandleStore(undefined)

    await store.save(DATA_DIR)

    assert.equal(await store.load(), undefined)
  })
})
