import { createReadStream } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { config as loadEnv } from 'dotenv'
import { defineConfig, type Plugin } from 'vite'

/**
 * The route the page asks a zip of the disk from, on the development server.
 *
 * @remarks
 * The browser can not read a `file://` url of a page served over http, so `?fromZip=file:///…` (or a plain path)
 * can not be fetched by the editor itself. The development server can read the disk, so it serves the file: the
 * editor asks for it here, and the response is the bytes of the zip.
 *
 * It is a **development** route (`apply: 'serve'`): the shipped editor has no server behind it, and a zip of the
 * disk is chosen there in the picker of the header. It only answers a request of the machine it runs on and only a
 * file that ends with `.zip`, so a server bound to a network address does not become a file reader.
 *
 * @returns The plugin that adds the route to the server.
 */
function localZipRoute(): Plugin {
  return {
    name: 'arx-local-zip',
    apply: 'serve',
    configureServer(server): void {
      server.middlewares.use('/__local-zip', (request, response) => {
        const address = request.socket.remoteAddress ?? ''
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
        const requested = new URL(request.url ?? '/', 'http://localhost').searchParams.get('path') ?? ''

        if (!local) {
          response.statusCode = 403
          response.end('The local zip route is for the machine of the server.')

          return
        }

        if (!requested.toLowerCase().endsWith('.zip')) {
          response.statusCode = 400
          response.end('The local zip route serves .zip files.')

          return
        }

        response.setHeader('Content-Type', 'application/zip')
        createReadStream(requested)
          .on('error', () => {
            response.statusCode = 404
            response.end(`No such file: ${requested}`)
          })
          .pipe(response)
      })
    },
  }
}

/**
 * The extensions a texture of the game may have.
 *
 * @remarks
 * A level names its textures the way the game reads them, which is usually with the extension, but not always: a
 * container may say `[glass]_windows2` while the file is `[glass]_windows2.jpg`.
 */
const TEXTURE_EXTENSIONS = ['', '.jpg', '.bmp', '.png', '.jpeg'] as const

/**
 * The extension a texture name may carry, though the file of the game has another one.
 *
 * @remarks
 * The game is of a windows that reads a texture by its stem: level 8 names `[stone]_human_castle_wall1.bmp`, and the
 * file of the game is a `.jpg`. The stem is what the folder is matched against.
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
 * The shapes a data directory may keep a file in.
 *
 * @remarks
 * A copy of the game's data may have the dlf and the llf of a level in `graph/levels`, and the scene (`fast.fts`) in
 * `game/graph/levels`: a file is tried in the folder itself first, then under `game/`.
 */
const DATA_PREFIXES = ['', 'game/'] as const

/**
 * The content type of a file, by its extension.
 *
 * @param path The path of the file.
 *
 * @returns The type the browser reads the file as.
 */
function contentTypeOf(path: string): string {
  const extension = extname(path).toLowerCase()

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg'
  }

  if (extension === '.png') {
    return 'image/png'
  }

  if (extension === '.bmp') {
    return 'image/bmp'
  }

  if (extension === '.zip') {
    return 'application/zip'
  }

  return 'application/octet-stream'
}

/**
 * One entry of a folder: its path and whether it is a folder of its own.
 */
interface FolderEntry {
  /**
   * The path of the entry.
   */
  readonly path: string
  /**
   * Whether the entry is a folder (the walk of a path needs the folders too).
   */
  readonly directory: boolean
}

/**
 * The folder listings, by the folder: a folder is listed once, the game's textures are in one folder and the page asks
 * for a texture of it many times.
 */
const listings = new Map<string, Map<string, FolderEntry>>()

/**
 * Lists the entries of a folder, by their name in lower case.
 *
 * @param folder The folder to list.
 *
 * @returns The path of every entry, keyed by the name in lower case.
 */
async function listingOf(folder: string): Promise<Map<string, FolderEntry>> {
  const cached = listings.get(folder)

  if (cached !== undefined) {
    return cached
  }

  const entries = await readdir(folder, { withFileTypes: true })
  const found = new Map<string, FolderEntry>()

  for (const entry of entries) {
    found.set(entry.name.toLowerCase(), { path: join(folder, entry.name), directory: entry.isDirectory() })
  }

  listings.set(folder, found)

  return found
}

/**
 * Finds a file of the data directory, the way the game finds it.
 *
 * @remarks
 * The game is of a windows that does not care about case, the folders of a linux do, and a copy of the data may keep a
 * path in a case of its own (`GAME/GRAPH/Levels/Level2/fast.fts` beside `graph/levels/level2`). Every **segment** of the
 * path is therefore matched against the listing of its parent in lower case, so a level folder is found whatever its
 * case is.
 *
 * @param root The folder of the data directory.
 * @param path The path inside it, like `game/graph/levels/level2/fast.fts`.
 *
 * @returns The path of the file on the disk, or `undefined` when the folder has no such file.
 */
async function resolveInDataDir(root: string, path: string): Promise<FolderEntry | undefined> {
  let current = root
  const segments = path.split('/').filter((segment) => {
    return segment !== ''
  })

  for (const segment of segments) {
    let entries: Map<string, FolderEntry>

    try {
      entries = await listingOf(current)
    } catch {
      return undefined
    }

    const found = entries.get(segment.toLowerCase())

    if (found === undefined) {
      return undefined
    }

    current = found.path
  }

  // the entry of the last segment: a file or a folder, the caller knows which one it wants
  try {
    const entries = await listingOf(dirname(current))
    const last = entries.get(basename(current).toLowerCase())

    return last ?? { path: current, directory: false }
  } catch {
    return { path: current, directory: false }
  }
}

/**
 * Finds a file of the data directory.
 *
 * @param root The folder of the data directory.
 * @param path The path inside it, like `game/graph/levels/level2/fast.fts`.
 *
 * @returns The path of the file on the disk, or `undefined` when the folder has no such file.
 */
async function fileInDataDir(root: string, path: string): Promise<string | undefined> {
  const found = await resolveInDataDir(root, path)

  if (found === undefined || found.directory) {
    return undefined
  }

  return found.path
}

/**
 * Finds a file of a level folder, in either shape of the data directory.
 *
 * @param root The folder of the data directory.
 * @param path The path inside the level folder, like `level8/fast.fts`.
 *
 * @returns The path of the file on the disk, or `undefined` when neither shape has it.
 */
async function levelInDataDir(root: string, path: string): Promise<string | undefined> {
  for (const prefix of DATA_PREFIXES) {
    const found = await fileInDataDir(root, `${prefix}graph/levels/${path}`)

    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

/**
 * Lists the level folders of a data directory.
 *
 * @remarks
 * The folders are named after the numbers of the levels, and a level is the folder that has the three files of it: the
 * scene (`fast.fts`), the dlf and the llf. The page asks for this **once**, instead of asking for the three files of
 * thirty levels (a console full of 404s, and a round of requests for every miss).
 *
 * @param root The folder of the data directory.
 *
 * @returns The numbers of the levels the folder has, in order.
 */
async function levelNumbersOf(root: string): Promise<number[]> {
  const numbers = new Set<number>()
  const names = new Set<string>()

  // the names of the level folders, from the two shapes the game's data may keep them in
  for (const prefix of DATA_PREFIXES) {
    const levelsFolder = await resolveInDataDir(root, `${prefix}graph/levels`)

    if (levelsFolder?.directory !== true) {
      continue
    }

    try {
      for (const entry of await readdir(levelsFolder.path, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          names.add(entry.name)
        }
      }
    } catch {
      // a folder that can not be read has no levels
    }
  }

  for (const name of names) {
    const digits = /^level(?<number>\d+)$/iu.exec(name)?.groups?.number

    if (digits === undefined) {
      continue
    }

    const number = Number(digits)

    // the three files of a level may sit in **two** folders (the dlf and the llf beside the map, the scene under
    // `game/`), so **each file** is looked for in both shapes
    const [fts, dlf, llf] = await Promise.all([
      levelInDataDir(root, `${name}/fast.fts`),
      levelInDataDir(root, `${name}/level${String(number)}.dlf`),
      levelInDataDir(root, `${name}/level${String(number)}.llf`),
    ])

    if (fts !== undefined && dlf !== undefined && llf !== undefined) {
      numbers.add(number)
    }
  }

  return [...numbers].toSorted((left, right) => {
    return left - right
  })
}

/**
 * The lists of the textures of the data directories, by the folder: a list is a walk of a few thousand files, and the
 * page asks for it once per folder.
 */
const textureListings = new Map<string, string[]>()

/**
 * Lists the image files of a data directory.
 *
 * @remarks
 * The texture list of the editor shows every texture a face can be painted with, and the game's are the files of
 * `graph/obj3d/textures`. The page can not walk a folder of the disk, so the route answers with the names a level calls
 * them: relative to the texture folder, with the subfolders of the game (`spells/`, `refinement/`) in the path
 * (`spells/fire.bmp`).
 *
 * @param root The folder of the data directory.
 *
 * @returns The names of the texture files, in order.
 */
async function textureNamesOf(root: string): Promise<string[]> {
  const cached = textureListings.get(root)

  if (cached !== undefined) {
    return cached
  }

  const names = new Set<string>()

  for (const prefix of DATA_PREFIXES) {
    const folder = await resolveInDataDir(root, `${prefix}graph/obj3d/textures`)

    if (folder?.directory !== true) {
      continue
    }

    try {
      for (const entry of await readdir(folder.path, { recursive: true })) {
        if (!EXTENSION_END.test(entry)) {
          continue
        }

        // the walk gives the path of the platform: the page reads the names of the game, with slashes
        names.add(entry.split(sep).join('/'))
      }
    } catch {
      // a folder that can not be read has no textures
    }
  }

  const listed = [...names].toSorted()

  textureListings.set(root, listed)

  return listed
}

/**
 * The route the page reads the **data directory of the game** from, on the development server.
 *
 * @remarks
 * A zip of a level carries the textures the author added, and not the ones of the game itself; the level files of the
 * original levels are not in the editor either. All of them are on the disk of the developer, and the page can not read
 * the disk, so the development server serves one file of one folder (`?dataDir=/home/lali/arx/arx-data`).
 *
 * The route is a **development** one (`apply: 'serve'`), answers the machine it runs on only, and only reads a file
 * **inside** the folder it is given: a server bound to a network address does not become a reader of the whole disk.
 * The scene of a level and its other files may sit in two places (`graph/` and `game/graph/`), and a texture may be
 * named without its extension, so both are tried before the answer is a 404.
 *
 * @returns The plugin that adds the route to the server.
 */
function localDataRoute(): Plugin {
  return {
    name: 'arx-local-data',
    apply: 'serve',
    configureServer(server): void {
      server.middlewares.use('/__local-data', (request, response) => {
        const address = request.socket.remoteAddress ?? ''
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
        const params = new URL(request.url ?? '/', 'http://localhost').searchParams
        const root = resolve(params.get('root') ?? '')
        const requested = params.get('path') ?? ''

        if (!local) {
          response.statusCode = 403
          response.end('The local data route is for the machine of the server.')

          return
        }

        if (params.get('root') === null) {
          response.statusCode = 400
          response.end('The local data route needs a root.')

          return
        }

        // the textures of the folder, once: the texture list of the editor shows them all
        if (requested === 'textures') {
          void (async (): Promise<void> => {
            const textures = await textureNamesOf(root)

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ textures }))
          })()

          return
        }

        // the levels of the folder, once: the page lists the maps of the header with it
        if (requested === 'levels') {
          void (async (): Promise<void> => {
            const levels = await levelNumbersOf(root)

            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ levels }))
          })()

          return
        }

        if (requested === '') {
          response.statusCode = 400
          response.end('The local data route needs a path.')

          return
        }

        void (async (): Promise<void> => {
          // the folder is matched against the stem of the name, with the extensions the game may have
          const folder = dirname(requested)
          const stem = stemOf(basename(requested))
          const names = TEXTURE_EXTENSIONS.map((extension) => {
            return `${stem}${extension}`
          })

          for (const prefix of DATA_PREFIXES) {
            for (const name of names) {
              const found = await fileInDataDir(root, `${prefix}${folder}/${name}`)

              if (found === undefined) {
                continue
              }

              try {
                const bytes = await readFile(found)

                response.setHeader('Content-Type', contentTypeOf(found))
                response.end(bytes)

                return
              } catch {
                // the next shape, or the next extension
              }
            }
          }

          response.statusCode = 404
          response.end(`No file ${requested} in ${root}`)
        })()
      })
    },
  }
}

/**
 * The version, the commit and the build date of this build, so the deployed editor can be told apart
 * from an older one.
 *
 * The commit is only known in the release workflow (it sets GITHUB_SHA), a local build says "local".
 *
 * @param version The version of `package.json`.
 *
 * @returns The one line build info the shell header shows.
 */
function buildInfo(version: string): string {
  const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'
  const builtAt = new Date().toISOString().slice(0, 10)

  return `v${version} (${commit}, ${builtAt})`
}

export default defineConfig(async () => {
  // the ports live in `.env`, next to this config (`.env.sample` documents them, and the defaults below are
  // the same numbers, so a clone without a `.env` works too)
  loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) })

  const packageJson = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8')) as {
    version: string
  }

  return {
    // The editor is served from https://arx-tools.github.io/editor/ - the website copies the
    // whole content of dist/ into its public/editor/ folder. The asset paths have to start with
    // /editor/, and the hashed file names of the assets make the browser fetch a new one after
    // every build without any ?v= suffix.
    base: '/editor/',
    plugins: [vue(), localZipRoute(), localDataRoute()],
    build: {
      // the level, the dock, vue and three in one chunk is a megabyte the browser takes in one piece, and
      // every deploy of the editor makes it download the level code again. The split below does not make
      // the first load smaller (the same code is in it, measured: 4 chunks, 978 KB, 265 KB gzip), it makes
      // the pieces cacheable: a deploy that touches only the editor's own code leaves the two vendor chunks
      // in the browser's cache. The biggest piece is three itself (579 KB), hence the raised limit
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              { name: 'three', test: /node_modules[/\\](?:three|three-mesh-bvh)[/\\]/ },
              { name: 'vendor', test: /node_modules[/\\]/ },
            ],
          },
        },
      },
    },
    server: {
      // the port belongs to this project (see `.env`), and it is not a suggestion: a taken port has to fail,
      // a quiet move to the next one would hide the collision the port is there to avoid
      port: Number(process.env.DEV_PORT ?? 5556),
      strictPort: true,
    },
    clearScreen: false,
    define: {
      // the header of the shell renders it, so it is a compile time constant instead of a
      // placeholder in index.html (the header is a vue component, the html can not reach into it)
      BUILD_INFO: JSON.stringify(buildInfo(packageJson.version)),
    },
  }
})
