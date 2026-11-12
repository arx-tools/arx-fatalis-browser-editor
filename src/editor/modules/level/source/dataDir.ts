import { shallowRef } from 'vue'
import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../../persistedRef/url.ts'
import {
  DATA_DIR_PREFIXES,
  dataFileUrl,
  IS_DEVELOPMENT,
  pathOfFileUrl,
  pathsOf,
  TEXTURE_FOLDER,
} from './dataDir/url.ts'
import {
  createHandleStore,
  fileInDirectory,
  IMAGE_EXTENSIONS,
  levelNumbersInDirectory,
  permissionOf,
  requestPermissionOf,
  textureNamesInDirectory,
  type DataDirHandleStore,
  type DataDirPermission,
} from './dataDirHandle.ts'

/**
 * The data directory of the game: the folder the level files, the textures, the models and the scripts come from.
 *
 * @remarks
 * The editor reads the level of a zip, and the textures a zip does not carry are the game's own. The game's files are
 * on the disk of the user, and a page served over http can not read the disk — so the **url names the folder**
 * (`?dataDir=…`), and everything is fetched from there.
 *
 * On the development server a `file://` url or an absolute path is a folder of the disk, served under a route of the
 * server (`vite.config.ts`): one route for every file, the level files and the textures among them. Anywhere else the
 * value is the base url of a folder that is served (a static host of the data directory).
 *
 * The folder is the one that holds `graph/`: `graph/levels/level8/fast.fts` is the scene of level 8,
 * `graph/obj3d/textures/[stone]_human_wall1.bmp` is one of its textures. A data directory of the game may keep a level
 * in two places at once (the dlf and the llf beside the map, the scene under `game/`), so a file is looked for in the
 * folder itself and then under `game/`: {@link DATA_DIR_PREFIXES}.
 */

/**
 * The url parameter that names the data directory of the game.
 */
export const DATA_DIR_PARAMETER = 'dataDir'

/**
 * One file of a data directory the user picked.
 */
export interface DataDirFile {
  /**
   * The path of the file inside the data directory, like `graph/obj3d/textures/wall.jpg`.
   */
  readonly path: string
  /**
   * The file itself.
   */
  readonly file: File
}

/**
 * The textures of the data directory, once they are read.
 */
let scannedTextures: string[] | undefined

/**
 * Forgets the list of the textures (a folder was picked, or the url changed).
 */
export function clearTextureScan(): void {
  scannedTextures = undefined
}

/**
 * The numbers of the levels the data directory was scanned for, once it is read.
 */
let scannedLevels: number[] | undefined

/**
 * Forgets the last scan of the levels (a folder was picked, or the url changed).
 */
export function clearDataDirScan(): void {
  scannedLevels = undefined
}

/**
 * The data directory of the session: the one of the url, or the one the browser remembered.
 */
let activeDataDir: string | undefined

/**
 * The data directory the user picked in the header.
 *
 * @remarks
 * The url can not name a folder of the user's disk (a page can not read it), and a **file picker** can: the header's
 * folder button gives the files of a data directory, and the editor reads them without a server. It is the way a
 * shipped editor gets the game's data; on the development server the url may name the folder instead.
 *
 * The files are kept by their path in lower case: the game is of a windows that does not care about case, the folders
 * of a linux do.
 */
let picked: Map<string, File> | undefined

/**
 * The name of the folder the user picked.
 *
 * @returns The name, or `undefined` when no folder is picked.
 */
let pickedName: string | undefined

/**
 * The folder the browser remembered, with the directory picker of the File System Access API.
 *
 * @remarks
 * This is the one a reload gives back: the handle is a live reference, so its files can be read again (with the
 * permission of the user). Firefox has no picker, and there the files are the snapshot of {@link picked}.
 */
let activeHandle: FileSystemDirectoryHandle | undefined

/**
 * How much the browser lets the page read the remembered folder.
 */
let handlePermission: DataDirPermission = 'granted'

/**
 * Where the data directory of the session comes from.
 *
 * @remarks
 * `path` is a folder of the disk (the url, or the input of the dialog), which only the development server reads.
 * `picked` is the files of a folder the user picked, which live for the session only (the browser can not open the
 * folder again). `handle` is a folder of the directory picker of the browser, remembered in the IndexedDB, with a
 * permission the browser may ask for again.
 */
export type DataDirKind = 'path' | 'picked' | 'handle'

/**
 * The data directory the header shows, as a reactive value.
 *
 * @remarks
 * The header is built *before* the app starts the folder (a child is set up first), so the mark of the folder can not be
 * a value read once: it follows this ref, and every change of the folder sets it.
 */
export const dataDirState = shallowRef<string | undefined>(undefined)

/**
 * Whether the setup dialog of the folder is open.
 *
 * @remarks
 * The dialog is opened from more than one place (the button of the header, the notice over a map that needs the folder,
 * the wish of a user to be asked again), so the state of it lives here, not in the component of the header.
 */
export const isDataDirSetupOpen = shallowRef<boolean>(false)

/**
 * Whether the app looked for the folder of the session already.
 *
 * @remarks
 * The header is set up before the app starts the folder, so a panel that has to say something about a missing folder
 * waits for this signal instead of reading a state that is still empty.
 */
export const dataDirSettled = shallowRef<boolean>(false)

/**
 * Where the folder of the session comes from, as a reactive value.
 */
export const dataDirKind = shallowRef<DataDirKind | undefined>(undefined)

/**
 * The permission of a remembered folder, as a reactive value: the dialog explains a `prompt` and a `denied` with it.
 */
export const dataDirPermission = shallowRef<DataDirPermission | undefined>(undefined)

/**
 * The store of the remembered folder.
 *
 * @remarks
 * The store is a parameter of the functions, so a test can hand over a fake one; the page uses
 * the IndexedDB of the browser (a store without one keeps nothing).
 */
const defaultHandleStore = createHandleStore()

/**
 * Sets the values the header and the dialog show.
 */
function syncDataDirState(): void {
  let kind: DataDirKind | undefined

  if (picked !== undefined) {
    kind = 'picked'
  } else if (activeHandle !== undefined) {
    kind = 'handle'
  } else if (activeDataDir !== undefined) {
    kind = 'path'
  }

  dataDirKind.value = kind
  dataDirState.value = pickedName ?? activeHandle?.name ?? activeDataDir

  if (activeHandle === undefined) {
    dataDirPermission.value = undefined
  } else {
    dataDirPermission.value = handlePermission
  }
}

/**
 * Forgets the data directory the user picked.
 */
export function clearPickedDataDir(): void {
  picked = undefined
  pickedName = undefined
  clearTextureScan()
  syncDataDirState()
}

/**
 * Forgets the data directory of every way: the folder of the picker, the files of the session and the path of the url.
 * The editor has no data directory after it.
 *
 * @param store The store of the remembered folder.
 */
export async function forgetDataDir(store: DataDirHandleStore = defaultHandleStore): Promise<void> {
  activeDataDir = undefined
  activeHandle = undefined
  handlePermission = 'granted'
  clearTextureScan()
  clearDataDirScan()
  clearPickedDataDir()
  syncDataDirState()

  await store.forget()
}

/**
 * Drops the folder of the session that came from the url.
 */
function forgetDataDirFromUrl(): void {
  activeDataDir = undefined
  syncDataDirState()
}

/**
 * Whether this build can read the folder a value names.
 *
 * @remarks
 * A folder of the disk is read by the **server that served the page**, and only when the folder is on the machine of
 * that server: the development server opens it with the file system of node and answers with the bytes, so the page
 * never touches the disk. Everywhere else (the site, any host) there is no such server, so a path of the user's disk
 * can not be read, whatever the browser allows: the page of that site is not on the machine of the user.
 *
 * A **url** that serves the folder is read by the page itself, so it works on any build.
 *
 * @param value The value the user gave.
 * @param isDev Whether the editor runs on its development server.
 *
 * @returns True when the folder can be read now.
 */
export function canReadDataDirOf(value: string, isDev = IS_DEVELOPMENT): boolean {
  const trimmed = value.trim()

  if (trimmed === '') {
    return false
  }

  if (pathOfFileUrl(trimmed) !== undefined || trimmed.startsWith('/')) {
    return isDev
  }

  // a windows drive path is not a shape the editor fetches from: the local route takes an absolute path of the server
  return !/^[A-Za-z]:[/\\]/u.test(trimmed)
}

/**
 * The data directory of the session.
 *
 * @remarks
 * The path of it comes from the url, and it lives for the session only: the editor keeps no folder of the disk in the
 * browser (a value that only one build can read would come back on a later visit as a folder the editor does not have).
 * The folder the browser can open again is the handle of the picker, and that one is kept by the IndexedDB.
 *
 * @returns The folder, or `undefined` when the editor has none.
 */
function activeDataDirName(): string | undefined {
  return activeDataDir
}

/**
 * The data directory of the game the url names.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The folder (a path or a url), or undefined when the url says nothing usable.
 */
export function dataDirFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, DATA_DIR_PARAMETER)

  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  return raw.trim()
}

/**
 * Starts the data directory of the session.
 *
 * @remarks
 * The url wins (a link that names a folder is what the user asked for this time), and it is **remembered**: the next
 * visit does not need the parameter, the folder comes from the browser. Without one in the url the remembered folder is
 * the data directory, so a user gives it once.
 *
 * @param url The query string to read, the one of the page by default.
 * @param store The store of the remembered folder.
 * @param isDev Whether the editor runs on its development server.
 *
 * @returns The folder of the session, or `undefined` when there is none.
 */
export async function startDataDir(
  url: UrlAdapter | undefined = getUrlAdapter(undefined),
  store: DataDirHandleStore = defaultHandleStore,
  isDev = IS_DEVELOPMENT,
): Promise<string | undefined> {
  const fromUrl = dataDirFromUrl(url)

  dataDirSettled.value = true

  if (fromUrl !== undefined) {
    // a link that names a folder is what the user asked for this time: it wins over the folder the browser remembers
    if (canReadDataDirOf(fromUrl, isDev)) {
      activeDataDir = fromUrl
      activeHandle = undefined
      handlePermission = 'granted'
      clearTextureScan()
      clearDataDirScan()
      syncDataDirState()
      await store.forget()

      return dataDirState.value
    }

    // a folder of the disk opened from a site that has no server on that machine: the page can not read it, so the
    // link is not the folder of the session (and it is not remembered, there is nothing to remember it in)
    forgetDataDirFromUrl()
  }

  const handle = await store.load()

  if (handle === undefined) {
    syncDataDirState()

    return undefined
  }

  activeHandle = handle
  handlePermission = await permissionOf(handle)
  clearTextureScan()
  clearDataDirScan()
  syncDataDirState()

  return dataDirState.value
}

/**
 * Takes the files of the data directory the user picked.
 *
 * @param files The path of every file inside the data directory and the file itself.
 * @param name The name of the folder, for the messages.
 * @param store The store of the remembered folder.
 */
export async function setPickedDataDir(
  files: readonly DataDirFile[],
  name: string,
  store: DataDirHandleStore = defaultHandleStore,
): Promise<void> {
  picked = new Map(
    files.map((entry) => {
      return [entry.path.toLowerCase(), entry.file]
    }),
  )
  pickedName = name

  // the files are a **snapshot**: the browser can not open the folder again after a reload, so the pick is the folder of
  // this session only — a remembered handle would come back as another folder on the next load
  activeDataDir = undefined
  activeHandle = undefined
  handlePermission = 'granted'
  clearTextureScan()
  clearDataDirScan()

  await store.forget()
  syncDataDirState()
}

/**
 * Takes the folder of the directory picker of the browser, and remembers it.
 *
 * @remarks
 * The handle is a live reference to the folder: the IndexedDB keeps it for the next visit, and the browser asks for the
 * permission again when it does not hold it. The path of the url is forgotten: the folder the user picked is the
 * one of the session and of the next visits.
 *
 * @param handle The folder the user picked.
 * @param permission The permission the picker left the page with.
 * @param store The store of the remembered folder.
 */
export async function setDataDirHandle(
  handle: FileSystemDirectoryHandle,
  permission: DataDirPermission,
  store: DataDirHandleStore = defaultHandleStore,
): Promise<void> {
  picked = undefined
  pickedName = undefined
  activeDataDir = undefined
  activeHandle = handle
  handlePermission = permission
  clearTextureScan()
  clearDataDirScan()

  await store.save(handle)
  syncDataDirState()
}

/**
 * Asks the browser for the permission of the remembered folder, from the press of the dialog's button.
 *
 * @param store The store of the remembered folder (a granted folder is saved again, a denied one is kept to explain).
 *
 * @returns The permission after the question, or `undefined` when there is no remembered folder.
 */
export async function requestDataDirPermission(
  store: DataDirHandleStore = defaultHandleStore,
): Promise<DataDirPermission | undefined> {
  if (activeHandle === undefined) {
    return undefined
  }

  handlePermission = await requestPermissionOf(activeHandle)
  clearTextureScan()
  clearDataDirScan()

  if (handlePermission === 'granted') {
    await store.save(activeHandle)
  }

  syncDataDirState()

  return handlePermission
}

/**
 * The name of the data directory: the one the user picked, or the folder of the url.
 *
 * @returns The name, or `undefined` when the editor has no data directory.
 */
export function dataDirName(): string | undefined {
  if (pickedName !== undefined) {
    return pickedName
  }

  if (activeHandle !== undefined) {
    return activeHandle.name
  }

  return activeDataDirName()
}

/**
 * Whether the editor has a data directory to read from.
 *
 * @returns True when a folder is picked, the url named one, or the browser remembered one.
 */
export function hasDataDir(): boolean {
  if (picked !== undefined || activeDataDirName() !== undefined) {
    return true
  }

  // a remembered folder the browser blocks (or has to ask for) is not a folder the editor can read yet
  return activeHandle !== undefined && handlePermission === 'granted'
}

/**
 * Downloads one file of the data directory.
 *
 * @remarks
 * A file that is not there (a 404) is not an error: the next shape is tried, and `undefined` says the directory has
 * none of them.
 *
 * @param dataDir The value of the {@link DATA_DIR_PARAMETER} parameter.
 * @param path The path of the file inside the data directory.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The bytes of the file, or `undefined` when the data directory has none of the paths tried.
 */
export async function fetchDataFile(
  dataDir: string,
  path: string,
  fetchImpl: typeof fetch = fetch,
  isDev = IS_DEVELOPMENT,
): Promise<ArrayBuffer | undefined> {
  // the development server finds the extension itself and tries the shapes in one request, so one path is enough
  const paths = pathsOf(path, !isDev)

  for (const candidate of paths) {
    let url: string

    try {
      url = dataFileUrl(dataDir, candidate, isDev)
    } catch {
      // a folder of the disk on a build with no server of that machine: there is nothing to ask for
      return undefined
    }

    const response = await fetchImpl(url)

    if (response.ok) {
      return await response.arrayBuffer()
    }
  }

  return undefined
}

/**
 * Reads one file of the data directory.
 *
 * @remarks
 * The folder the user picked in the header comes first (its files are on the page already, no server), then the folder
 * the url names (the development server, or a base url of a host). A file the directory has none of the shapes of is
 * not an error: the caller gets `undefined`, and a texture without one stays the placeholder.
 *
 * @param path The path of the file inside the data directory.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param isDev Whether the editor runs on the development server.
 * @param dataDir The folder of the session, the one of the url or the browser by default.
 *
 * @returns The bytes of the file, or `undefined` when the data directory has no such file.
 */
export async function readDataFile(
  path: string,
  fetchImpl: typeof fetch = fetch,
  isDev = IS_DEVELOPMENT,
  dataDir: string | undefined = activeDataDirName(),
): Promise<ArrayBuffer | undefined> {
  if (picked !== undefined) {
    for (const candidate of pathsOf(path, true)) {
      const file = picked.get(candidate.toLowerCase())

      if (file !== undefined) {
        return await file.arrayBuffer()
      }
    }

    return undefined
  }

  if (activeHandle !== undefined) {
    for (const candidate of pathsOf(path, true)) {
      const file = await fileInDirectory(activeHandle, candidate)

      if (file !== undefined) {
        return await file.arrayBuffer()
      }
    }

    return undefined
  }

  if (dataDir === undefined) {
    return undefined
  }

  return await fetchDataFile(dataDir, path, fetchImpl, isDev)
}

/**
 * The levels of the game fit in these numbers: the game has 22 maps, and the folders are named after them.
 */
const LEVEL_LIMIT = 32

/**
 * Reads the list of the levels the development server makes of the folder.
 *
 * @param dataDir The folder of the data directory.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The numbers of the levels, or `undefined` when the server does not answer with a list.
 */
async function listedLevelsOf(dataDir: string, fetchImpl: typeof fetch): Promise<number[] | undefined> {
  try {
    const response = await fetchImpl(dataFileUrl(dataDir, 'levels', true))

    if (!response.ok) {
      return undefined
    }

    const body: unknown = await response.json()

    if (typeof body !== 'object' || body === null) {
      return undefined
    }

    const { levels } = body as { levels?: unknown }

    if (!Array.isArray(levels)) {
      return undefined
    }

    return levels.filter((level): level is number => {
      return typeof level === 'number'
    })
  } catch {
    // no list from the server: the files are asked for one by one by the caller
    return undefined
  }
}

/**
 * Reads the numbers of the levels the data directory has.
 *
 * @remarks
 * A level is a folder with the three files of it: the scene (`fast.fts`), the dlf and the llf. The folder is named after
 * the number of the level, so the numbers of the folders that have the three files are the levels the editor can open.
 * The scan is kept: the list of the header does not ask for the same three files on every render.
 *
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The numbers of the levels, in order.
 */
export async function scanLevelNumbers(fetchImpl: typeof fetch = fetch, isDev = IS_DEVELOPMENT): Promise<number[]> {
  if (scannedLevels !== undefined) {
    return scannedLevels
  }

  // a remembered folder is walked once: the foldernames of the levels are the folders that have the three files
  if (activeHandle !== undefined) {
    const levels = await levelNumbersInDirectory(activeHandle)

    if (levels !== undefined) {
      scannedLevels = levels

      return scannedLevels
    }
  }

  // the development server lists the levels of the folder in **one** answer: asking for the three files of thirty
  // levels would be a console full of 404s, and a round of requests for every miss
  const dataDir = activeDataDirName()

  if (dataDir !== undefined && isDev) {
    const listed = await listedLevelsOf(dataDir, fetchImpl)

    if (listed !== undefined) {
      scannedLevels = listed

      return scannedLevels
    }
  }

  const numbers: number[] = []
  const reads = Array.from({ length: LEVEL_LIMIT }, async (_, level) => {
    const folder = `graph/levels/level${String(level)}`
    const fts = await readDataFile(`${folder}/fast.fts`, fetchImpl, isDev)

    if (fts === undefined) {
      return undefined
    }

    const [dlf, llf] = await Promise.all([
      readDataFile(`${folder}/level${String(level)}.dlf`, fetchImpl, isDev),
      readDataFile(`${folder}/level${String(level)}.llf`, fetchImpl, isDev),
    ])

    if (dlf === undefined || llf === undefined) {
      return undefined
    }

    return level
  })

  for (const level of await Promise.all(reads)) {
    if (level !== undefined) {
      numbers.push(level)
    }
  }

  scannedLevels = numbers.toSorted((left, right) => {
    return left - right
  })

  return scannedLevels
}

/**
 * Reads the list of the textures the development server makes of the folder.
 *
 * @remarks
 * The page can not list a folder of the disk, and asking for the files one by one is not a list: the names of the
 * textures are what a picker of them needs. The server walks the folder and answers with the names relative to
 * `graph/obj3d/textures` (the way a level names them), subfolders included.
 *
 * @param dataDir The folder of the data directory.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The names of the textures, or `undefined` when the server does not answer with a list.
 */
async function listedTexturesOf(dataDir: string, fetchImpl: typeof fetch): Promise<string[] | undefined> {
  try {
    const response = await fetchImpl(dataFileUrl(dataDir, 'textures', true))

    if (!response.ok) {
      return undefined
    }

    const body: unknown = await response.json()

    if (typeof body !== 'object' || body === null) {
      return undefined
    }

    const { textures } = body as { textures?: unknown }

    if (!Array.isArray(textures)) {
      return undefined
    }

    return textures.filter((name): name is string => {
      return typeof name === 'string'
    })
  } catch {
    // no list from the server: the widget lists the textures of the level itself
    return undefined
  }
}

/**
 * Reads the names of the textures the data directory has.
 *
 * @remarks
 * The texture list of the editor shows every texture a face can be painted with, and the ones of the game are in the
 * data directory — a folder of a few thousand files. A folder the user picked is already on the page (`picked`), so the
 * names come from the files; a folder the url names is listed by the development server. A **served** folder (the
 * production shape of the url) has no list: the editor then knows the textures of the level it loaded, and no more.
 *
 * The names are relative to `graph/obj3d/textures` and lower case for a picked folder (the game is of a windows that
 * does not care about the case, and the files of the page are keyed by their lower case path), the way a level names
 * them.
 *
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The names of the textures, in order.
 */
export async function listDataDirTextures(fetchImpl: typeof fetch = fetch, isDev = IS_DEVELOPMENT): Promise<string[]> {
  if (scannedTextures !== undefined) {
    return scannedTextures
  }

  const prefix = `${TEXTURE_FOLDER}/`.toLowerCase()

  if (picked !== undefined) {
    const names = new Set<string>()

    for (const path of picked.keys()) {
      if (!path.startsWith(prefix)) {
        continue
      }

      const name = path.slice(prefix.length)

      if (IMAGE_EXTENSIONS.test(name)) {
        names.add(name)
      }
    }

    scannedTextures = [...names].toSorted()

    return scannedTextures
  }

  // a remembered folder is walked: the names of the textures are the images under the folder of them
  if (activeHandle !== undefined) {
    const names = await textureNamesInDirectory(activeHandle)

    scannedTextures = names ?? []

    return scannedTextures
  }

  const dataDir = activeDataDirName()

  if (dataDir !== undefined && isDev) {
    const listed = await listedTexturesOf(dataDir, fetchImpl)

    if (listed !== undefined) {
      scannedTextures = listed.toSorted()

      return scannedTextures
    }
  }

  // a served folder can not be listed: the widget shows the textures the level itself brought
  scannedTextures = []

  return scannedTextures
}
