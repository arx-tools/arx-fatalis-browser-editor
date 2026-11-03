import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../persistedRef/url.ts'

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
 * The route the development server serves a file of the data directory on.
 */
const LOCAL_DATA_ROUTE = '/__local-data'

/**
 * The shapes a data directory may keep a file in.
 *
 * @remarks
 * The workspace's own copy has the dlf and the llf of a level in `graph/levels`, and the scene (`fast.fts`) in
 * `game/graph/levels`: a file is tried in the folder itself first, then under `game/`.
 */
export const DATA_DIR_PREFIXES = ['', 'game/'] as const

/**
 * The extensions a texture may have.
 *
 * @remarks
 * The game's textures are BMP, JPG and PNG files, and a level may name one without its extension (`[glass]_windows2`),
 * or with one the file does not have (level 8 says `[stone]_human_castle_wall1.bmp`, the file of the game is a `.jpg`).
 * The name is therefore matched by its **stem**, and the extensions are tried after it. The development server looks
 * the same way; a folder served as a url is asked file by file, so the caller does this walk.
 */
const TEXTURE_EXTENSIONS = ['', '.jpg', '.bmp', '.png', '.jpeg'] as const

/**
 * The extensions a name may carry and the extensions of a texture.
 */
const EXTENSION_END = /\.(?:jpe?g|bmp|png|tga)$/iu

/**
 * Reads the name of a texture without its extension.
 *
 * @param name The name a level gives its texture.
 *
 * @returns The name without an image extension at its end.
 */
function stemOf(name: string): string {
  return name.replace(EXTENSION_END, '')
}

/**
 * Whether the editor runs on its development server.
 *
 * @remarks
 * The route of the local data is a plugin of that server only, and the tests run in node, where `import.meta.env` is
 * not there at all.
 */
const IS_DEVELOPMENT = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

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
 * Takes the files of the data directory the user picked.
 *
 * @param files The path of every file inside the data directory and the file itself.
 * @param name The name of the folder, for the messages.
 */
export function setPickedDataDir(files: readonly DataDirFile[], name: string): void {
  picked = new Map(
    files.map((entry) => {
      return [entry.path.toLowerCase(), entry.file]
    }),
  )
  pickedName = name
}

/**
 * Forgets the data directory the user picked.
 */
export function clearPickedDataDir(): void {
  picked = undefined
  pickedName = undefined
}

/**
 * The name of the data directory: the one the user picked, or the folder of the url.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The name, or `undefined` when the editor has no data directory.
 */
export function dataDirName(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (pickedName !== undefined) {
    return pickedName
  }

  return dataDirFromUrl(url)
}

/**
 * Whether the editor has a data directory to read from.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns True when a folder is picked or the url names one.
 */
export function hasDataDir(url: UrlAdapter | undefined = getUrlAdapter(undefined)): boolean {
  return dataDirName(url) !== undefined
}

/**
 * The path of a `file://` url.
 *
 * @param value The folder the parameter names, which may be a file url.
 *
 * @returns The path of the folder the url names, or `undefined` when it is not a file url.
 */
function pathOfFileUrl(value: string): string | undefined {
  if (!value.startsWith('file://')) {
    return undefined
  }

  try {
    return decodeURIComponent(new URL(value).pathname)
  } catch {
    return undefined
  }
}

/**
 * The url one file of the data directory is fetched from.
 *
 * @param dataDir The value of the {@link DATA_DIR_PARAMETER} parameter.
 * @param path The path of the file inside the data directory, like `graph/levels/level8/fast.fts`.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The url the page should download the file from.
 *
 * @throws When the data directory is a folder of the disk and the editor has no development server to read it with.
 */
export function dataFileUrl(dataDir: string, path: string, isDev = IS_DEVELOPMENT): string {
  const filePath = pathOfFileUrl(dataDir)
  let local = filePath

  if (local === undefined && isDev && dataDir.startsWith('/')) {
    local = dataDir
  }

  if (local === undefined) {
    if (filePath !== undefined) {
      throw new Error(`The editor can not read ${dataDir}: a folder of the disk needs its development server.`)
    }

    return `${dataDir.replaceAll(/\/$/gu, '')}/${path}`
  }

  if (!isDev) {
    throw new Error(`The editor can not read ${local}: a folder of the disk needs its development server.`)
  }

  return `${LOCAL_DATA_ROUTE}?root=${encodeURIComponent(local)}&path=${encodeURIComponent(path)}`
}

/**
 * The paths a file of the data directory may be at, in the order they are tried.
 *
 * @param path The path of the file inside the data directory.
 * @param withExtensions Whether the extensions of a texture are tried after the plain name too.
 *
 * @returns The paths, the standard shape of the folder before the `game/` one.
 */
function pathsOf(path: string, withExtensions: boolean): string[] {
  let names: string[] = [path]

  if (withExtensions) {
    const stem = stemOf(path)

    names = TEXTURE_EXTENSIONS.map((extension) => {
      return `${stem}${extension}`
    })
  }

  const paths: string[] = []

  for (const prefix of DATA_DIR_PREFIXES) {
    for (const name of names) {
      paths.push(`${prefix}${name}`)
    }
  }

  return paths
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
    const response = await fetchImpl(dataFileUrl(dataDir, candidate, isDev))

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
 * @param dataDir The folder of the url, the one of the page by default.
 *
 * @returns The bytes of the file, or `undefined` when the data directory has no such file.
 */
export async function readDataFile(
  path: string,
  fetchImpl: typeof fetch = fetch,
  isDev = IS_DEVELOPMENT,
  dataDir: string | undefined = dataDirFromUrl(),
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

  if (dataDir === undefined) {
    return undefined
  }

  return await fetchDataFile(dataDir, path, fetchImpl, isDev)
}
