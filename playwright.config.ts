import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

/**
 * Reads the port of the test server from `.env`, next to this config.
 *
 * @remarks
 * The sample file documents the two ports, and the default here is the same number as the sample: a clone
 * without a `.env` runs the same way.
 *
 * @returns The port the browser tests start their development server on.
 */
function portOfTestServer(): number {
  loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)) })

  return Number(process.env.E2E_PORT ?? 5001)
}

/**
 * The port the development server of the tests listens on.
 *
 * @remarks
 * It is not the port of the developer's server on purpose: the tests start a server of their own, so a hot
 * reload can not change the page under them. Both ports come from `.env` (the sample file documents them),
 * and the numbers here are the defaults of a clone without one.
 */
const PORT = portOfTestServer()

/**
 * Tells whether the tests run on the continuous integration server.
 */
const isCI = process.env.CI !== undefined

/**
 * How many times a failed test is tried again.
 *
 * @remarks
 * The ci retries twice: a browser test can be unlucky on a shared runner, and a flake should not block a
 * branch. A local run does not retry, a failure there is the one to look at.
 */
let retries = 0

if (isCI) {
  retries = 2
}

export default defineConfig({
  // the e2e suite lives next to the unit tests but in its own folder: `node --test` does not run it and
  // playwright does not run the unit tests
  testDir: './tests/e2e',
  fullyParallel: true,
  // a `test.only` that was left in the code would silently hide every other test in the ci
  forbidOnly: isCI,
  retries,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${String(PORT)}/editor/`,
    // the dock stores shares, but the widgets are measured in pixels: the window is fixed, so a
    // geometry assertion means the same thing on every machine
    viewport: { width: 1631, height: 850 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // the two engines the editor is used in: the owner browses in firefox, most of the world in a
    // chromium based one
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        // the level needs a WebGL2 context, and a runner has no gpu: firefox would take its own software
        // renderer for a blocklisted driver and refuse webgl2 ("AllowWebgl2:false restricts context
        // creation"), which turns into a console error and fails the smoke test. These prefs say that the
        // software renderer is good enough, on any machine (the first ci run of the e2e died on exactly
        // that, in firefox only)
        launchOptions: {
          firefoxUserPrefs: {
            'webgl.force-enabled': true,
            'webgl.disabled': false,
            'webgl.forbid-software': false,
          },
        },
      },
    },
  ],
  webServer: {
    // the development server, not the preview of the build: it needs no build step and it serves the
    // sources through vite, which is the same path a developer sees
    //
    // `--host 127.0.0.1` is not the default on purpose: the runner may resolve `localhost` to `::1`, and a
    // vite that listens there never answers the health check (nor the browser) that arrives on 127.0.0.1.
    // The bind and the two callers name the same address, so the start does not depend on the resolver of
    // the machine (the first ci run of the e2e died on exactly that, as a 120 second timeout)
    command: `npm run dev -- --port ${String(PORT)} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${String(PORT)}/editor/`,
    reuseExistingServer: !isCI,
    // a start that fails has to say why: the banner and the errors of vite go into the log of the run
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 120_000,
  },
})
