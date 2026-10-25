import { readFile } from 'node:fs/promises'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

/**
 * Replaces the "<!-- build info -->" placeholder of index.html with the version of this build,
 * so the deployed editor can be told apart from an older one.
 *
 * The commit is only known in the release workflow (it sets GITHUB_SHA), a local build says
 * "local".
 */
function buildInfo(version: string): Plugin {
  const commit = process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'
  const builtAt = new Date().toISOString().slice(0, 10)
  const text = `v${version} (${commit}, ${builtAt})`

  return {
    name: 'arx-build-info',
    transformIndexHtml(html: string): string {
      // a replacer function, so the `$` patterns of the replacement are not expanded
      return html.replace('<!-- build info -->', () => {
        return text
      })
    },
  }
}

export default defineConfig(async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', import.meta.url), 'utf8')) as {
    version: string
  }

  return {
    // The editor is served from https://arx-tools.github.io/editor/ - the website copies the
    // whole content of dist/ into its public/editor/ folder. The asset paths have to start with
    // /editor/, and the hashed file names of the assets make the browser fetch a new one after
    // every build without any ?v= suffix.
    base: '/editor/',
    plugins: [vue(), buildInfo(packageJson.version)],
    clearScreen: false,
  }
})
