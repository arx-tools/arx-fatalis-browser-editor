import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'vite'

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
    plugins: [vue()],
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
