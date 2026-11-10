import { DATA_DIR_PREFIXES, TEXTURE_FOLDER } from './dataDir/url.ts'

/**
 * The folder the user gave the page with the directory picker of the browser (2026-11-10, the owner's request).
 *
 * @remarks
 * The `input[type=file][webkitdirectory]` of the first try is a **snapshot**: the page gets the files of the folder, and
 * the browser can not open it again after a reload. The **File System Access API** gives a
 * `FileSystemDirectoryHandle` instead, which is a live reference to the folder: it can be kept in the IndexedDB, and the
 * files of it can be read again after a reload (with the permission of the user). Chromium has it; Firefox does not,
 * and there the input is the only way (and its folder is forgotten by the next load).
 *
 * The handle knows the **name** of the folder, not its absolute path: the browser does not give that out. The two shapes
 * of the data directory (`game/` and the folder itself) and the extensions of a texture are the same here as in the
 * routes of the development server; a segment of the path is matched **case insensitively**, the way the server does,
 * because the game is a windows game and an extracted folder may carry upper case names (`GRAPH`).
 */

/**
 * How much the browser lets the page read a folder it was given before.
 */
export type DataDirPermission = 'granted' | 'prompt' | 'denied'

/**
 * The picker of a folder, which the types of the DOM do not name yet.
 *
 * @param options The id of the picker (so the browser opens it at the last place) and the mode it is asked for.
 *
 * @returns The handle of the folder the user picked.
 */
type DirectoryPicker = (options?: { readonly id?: string }) => Promise<FileSystemDirectoryHandle>

/**
 * The permission part of a handle, which the types of the DOM do not carry yet.
 */
interface PermissionHandle {
  /**
   * Reads the permission the browser holds without asking the user.
   */
  queryPermission(options: { readonly mode: 'read' }): Promise<DataDirPermission>
  /**
   * Asks the user for the permission of the folder (a user gesture is needed for it).
   */
  requestPermission(options: { readonly mode: 'read' }): Promise<DataDirPermission>
}

/**
 * The extensions the image files of the game have.
 */
export const IMAGE_EXTENSIONS = /\.(?:bmp|jpe?g|png|tga)$/iu

/**
 * The name of the database and of the object store the folder is kept in.
 */
const DATABASE_NAME = 'arx-data-dir'
const STORE_NAME = 'handles'
const HANDLE_KEY = 'data-dir'

/**
 * The store of the folder the user picked, so the browser remembers it for the next visit.
 */
export interface DataDirHandleStore {
  /**
   * Reads the folder the browser remembered.
   *
   * @returns The handle, or `undefined` when there is none (or the browser can not keep one).
   */
  readonly load: () => Promise<FileSystemDirectoryHandle | undefined>
  /**
   * Remembers the folder.
   *
   * @param handle The folder the user picked.
   */
  readonly save: (handle: FileSystemDirectoryHandle) => Promise<void>
  /**
   * Forgets the folder.
   */
  readonly forget: () => Promise<void>
}

/**
 * Reads the picker of the browser.
 *
 * @returns The picker, or `undefined` when the browser has none (Firefox, Safari).
 */
export function directoryPickerOf(): DirectoryPicker | undefined {
  const picker = (globalThis as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker

  if (typeof picker !== 'function') {
    return undefined
  }

  return picker
}

/**
 * Asks the user for a folder, with the picker of the browser.
 *
 * @param picker The picker of the browser, the one of the page by default.
 *
 * @returns The folder, or `undefined` when the browser has no picker or the user cancelled it.
 */
export async function pickDirectory(
  picker: DirectoryPicker | undefined = directoryPickerOf(),
): Promise<FileSystemDirectoryHandle | undefined> {
  if (picker === undefined) {
    return undefined
  }

  try {
    return await picker({ id: 'arx-data-dir' })
  } catch {
    // the user closed the picker: there is no folder, and that is not an error
    return undefined
  }
}

/**
 * Reads how much the browser lets the page read a folder it was given before, without asking the user.
 *
 * @remarks
 * A browser that does not carry the permission part of the API (it can not: the handle came from its picker) is read as
 * granted, and a read that fails says what happened.
 *
 * @param handle The folder.
 *
 * @returns The permission the browser holds.
 */
export async function permissionOf(handle: FileSystemDirectoryHandle): Promise<DataDirPermission> {
  const permission = handle as unknown as Partial<PermissionHandle>

  if (typeof permission.queryPermission !== 'function') {
    return 'granted'
  }

  try {
    return await permission.queryPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

/**
 * Asks the user for the permission of a folder the browser remembered.
 *
 * @remarks
 * The browser only asks inside a user gesture: the dialog calls this from the press of the button that says the folder
 * needs it.
 *
 * @param handle The folder.
 *
 * @returns The permission the browser holds after the question.
 */
export async function requestPermissionOf(handle: FileSystemDirectoryHandle): Promise<DataDirPermission> {
  const permission = handle as unknown as Partial<PermissionHandle>

  if (typeof permission.requestPermission !== 'function') {
    return 'granted'
  }

  try {
    return await permission.requestPermission({ mode: 'read' })
  } catch {
    return 'denied'
  }
}

/**
 * Opens the database of the store.
 *
 * @param factory The IndexedDB of the page, the one of the browser by default.
 *
 * @returns The database, or `undefined` when the browser has none (or refuses to open it).
 */
async function openDatabase(factory: IDBFactory | undefined): Promise<IDBDatabase | undefined> {
  if (factory === undefined) {
    return undefined
  }

  return await new Promise<IDBDatabase | undefined>((resolve) => {
    let request: IDBOpenDBRequest

    try {
      request = factory.open(DATABASE_NAME, 1)
    } catch {
      resolve(undefined)

      return
    }

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    })

    request.addEventListener('success', () => {
      resolve(request.result)
    })

    request.addEventListener('error', () => {
      resolve(undefined)
    })

    request.addEventListener('blocked', () => {
      resolve(undefined)
    })
  })
}

/**
 * Builds the store of the folder, over the IndexedDB of the browser.
 *
 * @param factory The IndexedDB of the page, the one of the browser by default.
 *
 * @returns The store; without an IndexedDB it keeps nothing, and every operation is a no-op.
 */
export function createHandleStore(factory: IDBFactory | undefined = globalThis.indexedDB): DataDirHandleStore {
  return {
    load: async (): Promise<FileSystemDirectoryHandle | undefined> => {
      const database = await openDatabase(factory)

      if (database === undefined) {
        return undefined
      }

      try {
        return await new Promise<FileSystemDirectoryHandle | undefined>((resolve) => {
          const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY)

          request.addEventListener('success', () => {
            const value: unknown = request.result

            if (value === undefined) {
              resolve(undefined)

              return
            }

            resolve(value as FileSystemDirectoryHandle)
          })

          request.addEventListener('error', () => {
            resolve(undefined)
          })
        })
      } catch {
        return undefined
      } finally {
        database.close()
      }
    },

    save: async (handle: FileSystemDirectoryHandle): Promise<void> => {
      const database = await openDatabase(factory)

      if (database === undefined) {
        return
      }

      try {
        await new Promise<void>((resolve) => {
          const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(handle, HANDLE_KEY)

          request.addEventListener('success', () => {
            resolve()
          })

          request.addEventListener('error', () => {
            resolve()
          })
        })
      } catch {
        // a browser that refuses the store keeps the folder for the session only
      } finally {
        database.close()
      }
    },

    forget: async (): Promise<void> => {
      const database = await openDatabase(factory)

      if (database === undefined) {
        return
      }

      try {
        await new Promise<void>((resolve) => {
          const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(HANDLE_KEY)

          request.addEventListener('success', () => {
            resolve()
          })

          request.addEventListener('error', () => {
            resolve()
          })
        })
      } catch {
        // nothing to forget
      } finally {
        database.close()
      }
    },
  }
}

/**
 * Finds the entry of a path in a folder, matching the names of the segments **without the case**.
 *
 * @remarks
 * The game is a windows game, and an extracted folder may have `GRAPH` where the editor asks for `graph`: the listing of
 * a folder is read and the names are compared in lower case, the way the routes of the development server do it. The
 * walk is lazy (one listing per folder it has to open).
 *
 * @param root The folder the path starts from.
 * @param path The path inside it, like `game/graph/levels/level8/fast.fts`.
 *
 * @returns The entry, or `undefined` when the folder has no such path.
 */
export async function entryInDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | undefined> {
  const segments = path.split('/').filter((segment) => {
    return segment !== ''
  })
  let current: FileSystemDirectoryHandle | undefined = root

  for (const [index, segment] of segments.entries()) {
    if (current === undefined) {
      return undefined
    }

    let found: FileSystemDirectoryHandle | FileSystemFileHandle | undefined
    const wanted = segment.toLowerCase()

    for await (const [name, entry] of current.entries()) {
      if (name.toLowerCase() === wanted) {
        found = entry

        break
      }
    }

    if (found === undefined) {
      return undefined
    }

    if (index === segments.length - 1) {
      return found
    }

    if (found.kind !== 'directory') {
      return undefined
    }

    current = found
  }

  return undefined
}

/**
 * Finds a folder of a path in a folder, without the case of the names.
 *
 * @param root The folder the path starts from.
 * @param path The path of the folder inside it.
 *
 * @returns The folder, or `undefined` when the path does not lead to one.
 */
export async function directoryInDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | undefined> {
  const entry = await entryInDirectory(root, path)

  if (entry?.kind !== 'directory') {
    return undefined
  }

  return entry
}

/**
 * Reads one file of a folder, without the case of the names.
 *
 * @param root The folder the path starts from.
 * @param path The path of the file inside it.
 *
 * @returns The file, or `undefined` when the folder has no such file.
 */
export async function fileInDirectory(root: FileSystemDirectoryHandle, path: string): Promise<File | undefined> {
  const entry = await entryInDirectory(root, path)

  if (entry?.kind !== 'file') {
    return undefined
  }

  try {
    return await entry.getFile()
  } catch {
    // a file the folder has but the browser refuses to read (it was removed, or the permission is gone)
    return undefined
  }
}

/**
 * Walks a folder of the textures, collecting the names of the images.
 *
 * @param folder The folder to walk.
 * @param prefix The path of the folder inside the folder of the textures.
 * @param names The names found so far, written in place.
 */
async function collectTextures(folder: FileSystemDirectoryHandle, prefix: string, names: string[]): Promise<void> {
  for await (const [name, entry] of folder.entries()) {
    if (entry.kind === 'directory') {
      await collectTextures(entry, `${prefix}${name}/`, names)

      continue
    }

    if (IMAGE_EXTENSIONS.test(name)) {
      names.push(`${prefix}${name}`.toLowerCase())
    }
  }
}

/**
 * Lists the textures of a folder of the game, under the folder of the textures.
 *
 * @remarks
 * The names are relative to `graph/obj3d/textures` and in lower case, the way a level names a texture and the way the
 * picked folder keys its files. The subfolders (the spells, the refinements) are walked, and the names carry them.
 *
 * @param root The data directory.
 *
 * @returns The names of the textures, in order, or `undefined` when the folder has no textures.
 */
export async function textureNamesInDirectory(root: FileSystemDirectoryHandle): Promise<string[] | undefined> {
  for (const prefix of DATA_DIR_PREFIXES) {
    const folder = await directoryInDirectory(root, `${prefix}${TEXTURE_FOLDER}`)

    if (folder === undefined) {
      continue
    }

    const names: string[] = []

    await collectTextures(folder, '', names)

    return names.toSorted()
  }

  return undefined
}

/**
 * Lists the level folders of a data directory.
 *
 * @remarks
 * A level is the folder with the three files of it: the scene (`fast.fts`), the dlf and the llf. The walk reads the
 * folder of the levels once, and asks for the three files of a folder only when it looks like a level (`level8`).
 *
 * @param root The data directory.
 *
 * @returns The numbers of the levels, in order, or `undefined` when the folder has no levels.
 */
export async function levelNumbersInDirectory(root: FileSystemDirectoryHandle): Promise<number[] | undefined> {
  for (const prefix of DATA_DIR_PREFIXES) {
    const levels = await directoryInDirectory(root, `${prefix}graph/levels`)

    if (levels === undefined) {
      continue
    }

    const numbers: number[] = []

    for await (const [name, entry] of levels.entries()) {
      const match = /^level(?<level>\d+)$/iu.exec(name)
      const number = match?.groups?.level

      if (number === undefined || entry.kind !== 'directory') {
        continue
      }

      const level = Number(number)
      const folder = `${prefix}graph/levels/${name}`

      const [fts, dlf, llf] = await Promise.all([
        fileInDirectory(root, `${folder}/fast.fts`),
        fileInDirectory(root, `${folder}/level${String(level)}.dlf`),
        fileInDirectory(root, `${folder}/level${String(level)}.llf`),
      ])

      if (fts !== undefined && dlf !== undefined && llf !== undefined) {
        numbers.push(level)
      }
    }

    return numbers.toSorted((left, right) => {
      return left - right
    })
  }

  return undefined
}
