import { readFile } from 'node:fs/promises'
import process from 'node:process'
import vue from '@vitejs/plugin-vue'
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
    clearScreen: false,
    define: {
      // the header of the shell renders it, so it is a compile time constant instead of a
      // placeholder in index.html (the header is a vue component, the html can not reach into it)
      BUILD_INFO: JSON.stringify(buildInfo(packageJson.version)),
    },
  }
})
