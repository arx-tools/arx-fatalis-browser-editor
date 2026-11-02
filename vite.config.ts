import { createReadStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
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
    plugins: [vue(), localZipRoute()],
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
