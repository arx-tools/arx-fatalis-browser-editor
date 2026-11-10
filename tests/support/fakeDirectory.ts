/* eslint-disable no-use-before-define -- the fake is one module: the walk and the handle of a folder refer to each other */
/**
 * The fake folder of the tests: a directory handle, the way the page sees one, built from a plain tree.
 *
 * @remarks
 * The File System Access API of the browser has no fake in node, and the code that walks a folder (the textures, the
 * levels, the files of the data directory) needs one: the tree below is spelled as the game's folder is (`GRAPH`,
 * `level8`), and the builder gives the handle of it with the two methods the walk uses — the async entries and the file
 * of a name. The case of the names stays as the tree has it: the walk is what matches it.
 */

/**
 * A file of the fake folder: the bytes of it, as text.
 */
export interface FakeFile {
  /**
   * The bytes of the file.
   */
  readonly file: string
}

/**
 * A folder of the fake folder: its entries by their names.
 */
export interface FakeFolder {
  /**
   * The entries of the folder.
   */
  readonly folder: Readonly<Record<string, FakeFile | FakeFolder>>
}

/**
 * Tells a folder of the fake tree from a file of it.
 *
 * @param entry The entry to look at.
 *
 * @returns True for a folder.
 */
function isFolder(entry: FakeFile | FakeFolder): entry is FakeFolder {
  return 'folder' in entry
}

/**
 * Walks the entries of a fake folder, the way the async iterator of a handle does.
 *
 * @remarks
 * The fake returns the entries at once, and the interface of the iterator is async: the generator is async because the
 * caller awaits it, and not because it waits for anything.
 *
 * @param folder The folder to walk.
 *
 * @yields The name and the handle of every entry of the folder.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- the fake has nothing to wait for, the interface is async
async function* entriesOf(
  folder: FakeFolder,
): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]> {
  for (const [entryName, entry] of Object.entries(folder.folder)) {
    if (isFolder(entry)) {
      yield [entryName, fakeDirectoryHandle(entry, entryName)]

      continue
    }

    yield [entryName, fakeFileHandle(entryName, entry)]
  }
}

/**
 * Builds the handle of a file of the fake tree.
 *
 * @remarks
 * The handle gives the file at once, and not in a promise: the page awaits it, and the await of a value is the value.
 *
 * @param name The name the file has in its folder.
 * @param entry The bytes of the file.
 *
 * @returns What a `getFileHandle` of the browser gives back.
 */
function fakeFileHandle(name: string, entry: FakeFile): FileSystemFileHandle {
  return {
    kind: 'file' as const,
    name,
    getFile: (): File => {
      return new File([entry.file], name)
    },
  } as unknown as FileSystemFileHandle
}

/**
 * Builds the handle of a folder of the fake tree.
 *
 * @remarks
 * The two lookups of the handle give their answer at once (the page awaits them, and the await of a value is the value),
 * and a missing entry throws the way the browser does: the walk of a folder is what catches it.
 *
 * @param folder The folder of the tree.
 * @param name The name the folder has in its parent, `data-dir` for the root.
 *
 * @returns The handle the walk of a folder is given.
 */
export function fakeDirectoryHandle(folder: FakeFolder, name = 'data-dir'): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory' as const,
    name,
    entries: (): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]> => {
      return entriesOf(folder)
    },
    getDirectoryHandle: (entryName: string): unknown => {
      const entry = folder.folder[entryName]

      if (entry === undefined || !isFolder(entry)) {
        throw new Error(`no folder ${entryName}`)
      }

      return fakeDirectoryHandle(entry, entryName)
    },
    getFileHandle: (entryName: string): unknown => {
      const entry = folder.folder[entryName]

      if (entry === undefined || isFolder(entry)) {
        throw new Error(`no file ${entryName}`)
      }

      return fakeFileHandle(entryName, entry)
    },
  }

  return handle as unknown as FileSystemDirectoryHandle
}

/**
 * A handle whose permission the test sets, and which counts the questions of the page.
 *
 * @param permission What the browser answers to the question.
 * @param name The name of the folder the handle stands for.
 *
 * @returns The handle, and the counter of the questions.
 */
export function fakePermissionHandle(
  permission: 'granted' | 'prompt' | 'denied',
  name = 'data-dir',
): { handle: FileSystemDirectoryHandle; asked: () => number } {
  let asked = 0
  const handle = {
    kind: 'directory' as const,
    name,
    queryPermission: (): 'granted' | 'prompt' | 'denied' => {
      return permission
    },
    requestPermission: (): 'granted' | 'prompt' | 'denied' => {
      asked = asked + 1

      return permission
    },
  }

  return {
    handle: handle as unknown as FileSystemDirectoryHandle,
    asked: (): number => {
      return asked
    },
  }
}

/**
 * A data directory of the tests: the two shapes of the game's folder, with the case a windows extraction has.
 */
export const FAKE_DATA_DIR: FakeFolder = {
  folder: {
    GRAPH: {
      folder: {
        levels: {
          folder: {
            level8: {
              folder: {
                'fast.fts': { file: 'fts' },
                'level8.dlf': { file: 'dlf' },
                'level8.llf': { file: 'llf' },
              },
            },
            level9: { folder: { 'fast.fts': { file: 'fts' } } },
          },
        },
        obj3d: {
          folder: {
            textures: {
              folder: {
                '[stone]_wall.bmp': { file: 'bmp' },
                spells: { folder: { 'fire.jpg': { file: 'jpg' } } },
                'notes.txt': { file: 'txt' },
              },
            },
          },
        },
      },
    },
  },
}
