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
  // a folder is listed once per request that looks into it: the game's textures are in one folder, and the page asks
  // for a texture of it many times
  const listings = new Map<string, Map<string, string>>()

  /**
   * Lists the files of a folder, by their name in lower case.
   *
   * @param folder The folder to list.
   *
   * @returns The path of every file, keyed by the name in lower case.
   */
  async function listingOf(folder: string): Promise<Map<string, string>> {
    const cached = listings.get(folder)

    if (cached !== undefined) {
      return cached
    }

    const entries = await readdir(folder, { withFileTypes: true })
    const files = new Map<string, string>()

    for (const entry of entries) {
      if (entry.isFile()) {
        files.set(entry.name.toLowerCase(), join(folder, entry.name))
      }
    }

    listings.set(folder, files)

    return files
  }

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

        if (requested === '' || params.get('root') === null) {
          response.statusCode = 400
          response.end('The local data route needs a root and a path.')

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
              const path = resolve(root, `${prefix}${folder}`, name)

              // a path that leaves the folder is not a file of the data directory
              if (!path.startsWith(`${root}${sep}`)) {
                continue
              }

              try {
                // the game is of a windows that does not care about case, the folder of a linux that does: the name
                // a level gives is matched against the folder in lower case
                const files = await listingOf(dirname(path))
                const found = files.get(basename(path).toLowerCase())

                if (found === undefined) {
                  continue
                }

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
