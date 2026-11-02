import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../persistedRef/url.ts'

/**
 * The textures of the game itself, beside the ones a zip of a level carries.
 *
 * @remarks
 * A zip of a level holds the textures its author added, and none of the ones the level uses from the game: a level
 * draws with both, so a zip alone leaves a part of its containers without a texture. The editor can not read the disk
 * of the user, so the game's folder is named in the url (`?gameTextures=…`), and the textures are fetched from there.
 *
 * On the development server a `file://` url or an absolute path is a folder of the disk, served under the route of
 * `vite.config.ts` (a route of the development server only). Anywhere else the value is the base url of a folder that
 * is served (a static host of the textures). The two are the same shape as the `fromZip` parameter: the url names
 * where the bytes come from.
 *
 * @see zipSource.ts for the zip of the level itself.
 */

/**
 * The url parameter that names the folder of the game's textures.
 */
export const GAME_TEXTURES_PARAMETER = 'gameTextures'

/**
 * The route the development server serves a folder of textures on.
 *
 * @remarks
 * The browser can not read a `file://` url of a page served over http, so the development server reads the folder and
 * hands the files over (see `vite.config.ts`).
 */
const LOCAL_TEXTURES_ROUTE = '/__local-textures'

/**
 * Whether the editor runs on its development server.
 *
 * @remarks
 * The route of the local textures is a plugin of that server only, and the tests run in node, where `import.meta.env`
 * is not there at all.
 */
const IS_DEVELOPMENT = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true

/**
 * The folder of the game's textures the url names.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The folder (a path or a url), or undefined when the url says nothing usable.
 */
export function gameTexturesFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, GAME_TEXTURES_PARAMETER)

  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  return raw.trim()
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
 * The url one texture of the folder is fetched from.
 *
 * @param folder The value of the {@link GAME_TEXTURES_PARAMETER} parameter.
 * @param name The name the level calls the texture.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The url of the file.
 *
 * @throws When the folder is a folder of the disk and the editor has no development server to read it with.
 */
export function gameTextureUrl(folder: string, name: string, isDev = IS_DEVELOPMENT): string {
  const filePath = pathOfFileUrl(folder)
  let local = filePath

  if (local === undefined && isDev && folder.startsWith('/')) {
    local = folder
  }

  if (local === undefined) {
    if (filePath !== undefined) {
      throw new Error(`The editor can not read ${folder}: a folder of the disk needs its development server.`)
    }

    return `${folder.replaceAll(/\/$/gu, '')}/${encodeURIComponent(name)}`
  }

  if (!isDev) {
    throw new Error(`The editor can not read ${local}: a folder of the disk needs its development server.`)
  }

  return `${LOCAL_TEXTURES_ROUTE}?dir=${encodeURIComponent(local)}&name=${encodeURIComponent(name)}`
}

/**
 * The extensions a texture may have, after the name a level gives it.
 *
 * @remarks
 * The game's textures are BMP, JPG and PNG files, and a level may name one without its extension (`[glass]_windows2`),
 * so the name alone is tried first and the extensions after it. The development server looks the same way; a folder
 * served as a url is asked file by file, so the caller does this walk.
 */
const TEXTURE_EXTENSIONS = ['', '.jpg', '.bmp', '.png', '.jpeg'] as const

/**
 * Downloads one texture of the game's folder.
 *
 * @remarks
 * The extensions are tried in turn, and a file that is not there (a 404) is not an error: the level simply has one
 * flat face.
 *
 * @param folder The value of the {@link GAME_TEXTURES_PARAMETER} parameter.
 * @param name The name the level calls the texture.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param isDev Whether the editor runs on the development server.
 *
 * @returns The bytes of the texture, or `undefined` when the folder has none of the names tried.
 */
export async function fetchGameTexture(
  folder: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
  isDev = IS_DEVELOPMENT,
): Promise<ArrayBuffer | undefined> {
  for (const extension of TEXTURE_EXTENSIONS) {
    // the development server finds the extension itself; a folder of a static host does not
    if (isDev && extension !== '') {
      break
    }

    const response = await fetchImpl(gameTextureUrl(folder, `${name}${extension}`, isDev))

    if (response.ok) {
      return await response.arrayBuffer()
    }
  }

  return undefined
}
