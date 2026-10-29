import process from 'node:process'
import { defineConfig } from '@playwright/test'

/**
 * The port the development server of the tests listens on.
 *
 * @remarks
 * It is not 5173 on purpose: that is the port of the server a developer runs by hand, and the tests
 * should not talk to a page which a hot reload is changing under them.
 */
const PORT = 4173

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
    { name: 'firefox', use: { browserName: 'firefox' } },
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
