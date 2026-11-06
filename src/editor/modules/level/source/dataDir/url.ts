/**
 * The url and the path of the data directory of the game.
 *
 * @remarks
 * The folder of the game can be named by the url (`?dataDir=…`), and the editor reads its files over http: a `file://`
 * url or an absolute path is a folder of the disk, which only the **development server** can serve (one route for every
 * file, `vite.config.ts`). Anywhere else the value is the base url of a folder that is served (a static host of the data
 * directory).
 *
 * This module is the math of those two shapes, with nothing of the session in it: the route of the server, the shapes a
 * file may be at inside the folder ({@link DATA_DIR_PREFIXES}), the url a file is fetched from, and the extensions a
 * texture may have. The state of the session (the folder of the url, the folder the user picked, the storage) is
 * [`../dataDir.ts`](../dataDir.ts).
 */

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
export function stemOf(name: string): string {
  return name.replace(EXTENSION_END, '')
}

/**
 * Whether the editor runs on its development server.
 *
 * @remarks
 * The route of the local data is a plugin of that server only, and the tests run in node, where `import.meta.env` is
 * not there at all.
 */
export const IS_DEVELOPMENT = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

/**
 * The path of a `file://` url.
 *
 * @param value The folder the parameter names, which may be a file url.
 *
 * @returns The path of the folder the url names, or `undefined` when it is not a file url.
 */
export function pathOfFileUrl(value: string): string | undefined {
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
export function pathsOf(path: string, withExtensions: boolean): string[] {
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
 * The folder of the game's textures, inside the data directory.
 *
 * @remarks
 * The textures of the game are the images a level names in its texture containers, relative to this folder
 * (`graph/obj3d/textures/[stone]_human_wall1.bmp`). The folder has the spells and the refinements of the game in
 * subfolders of its own, and a name may carry that part (`spells/fire.bmp`), which is why the editor walks it whole.
 */
export const TEXTURE_FOLDER = 'graph/obj3d/textures'
