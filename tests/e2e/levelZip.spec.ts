import type { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import {
  clickCrosshair,
  lockPointer,
  openZip,
  readPose,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * A level opened from a zip of the user, through the button of the header.
 *
 * @remarks
 * The zip is the way a level comes back into the editor from the disk: the three files of the level under the paths of
 * the installed game, the assets of the level around them and a manifest that names them. The test builds the zip in
 * memory from the blank level of the editor itself, so it needs no game data of its own — and the number of faces it
 * asks for is one, which the level on the screen does not have, so the statistics shows that the map was replaced.
 */
test.setTimeout(120_000)

/**
 * Lets the pointer go in the page.
 *
 * @remarks
 * The lock is the browser's, and a click of the test can not release it: a locked pointer sends every mouse event to the
 * canvas of the walkable view, so the header is out of reach. The call runs in the page, where the document is.
 */
function releaseThePointer(): void {
  document.exitPointerLock()
}

/**
 * The bytes of a zip holding the minimal blank level, the way the generator writes a level out.
 *
 * @returns The zip, ready for the file input.
 */
async function zipOfABlankLevel(): Promise<Buffer> {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const level = 'level1'
  const archive = new JSZip()

  archive.file(`game/graph/levels/${level}/fast.fts`, files.fts)
  archive.file(`graph/levels/${level}/${level}.dlf`, files.dlf)
  archive.file(`graph/levels/${level}/${level}.llf`, files.llf)
  archive.file(
    'manifest.json',
    JSON.stringify({
      name: 'Blank minimal',
      version: '1.0.0',
      // the paths of the real manifest are absolute machine paths, so the loader matches the names
      files: [
        `/home/lali/maps/blank/game/graph/levels/${level}/fast.fts`,
        `/home/lali/maps/blank/graph/levels/${level}/${level}.dlf`,
        `/home/lali/maps/blank/graph/levels/${level}/${level}.llf`,
      ],
    }),
  )

  return await archive.generateAsync({ type: 'nodebuffer' })
}

test('a level of a zip replaces the level on the screen', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)

  // no level in the url: the editor opens the blank level, 121 faces of the flat preset
  await page.goto('/')
  await waitForLevel(page)

  expect(await statOf(page, 'Total faces')).toBe(121)

  await openZip(page, 'blank-minimal.zip', await zipOfABlankLevel())

  // the zip holds one quad, so the statistics of the level on the screen becomes one
  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(1)
})

test('a zip without a level says what it is missing', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto('/')
  await waitForLevel(page)

  const archive = new JSZip()

  archive.file('graph/levels/level1/level1.dlf', 'not a real level')
  archive.file('graph/levels/level1/level1.llf', 'not a real level')

  await openZip(page, 'no-scene.zip', await archive.generateAsync({ type: 'nodebuffer' }))

  // the walkable view carries the failure of the load: a zip without a scene is not a level
  await expect(page.locator('[data-widget-kind="3d-view"] .status')).toContainText('no-scene.zip has no .fts file')
})

test('a zip opens from the url, without the picker', async ({ page }, testInfo) => {
  // the `fromZip` parameter: a hand test is one url, the editor downloads the zip itself
  const zipPath = testInfo.outputPath('url-level.zip')

  await writeFile(zipPath, await zipOfABlankLevel())

  await seedLayout(page, editorLayout)
  await page.goto(`/?fromZip=${encodeURIComponent(zipPath)}`)
  await waitForLevel(page)

  // the zip holds the minimal blank level, so the editor opens its one face and not the 121 of the blank level
  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(1)
})

test('a zip of the url that is not there says what happened', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto(`/?fromZip=${encodeURIComponent('/no/such/level.zip')}`)

  // a zip that does not load is not a silent blank level: the walkable view carries the failure
  await expect(page.locator('[data-widget-kind="3d-view"] .status')).toContainText('404')
})

test('the export of a level that came from a zip keeps the keys of that zip', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  await openZip(page, 'blank-minimal.zip', await zipOfABlankLevel())

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(1)

  // the archive of the level: the base of the zip it came from, with the block of the editor over it
  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const data = await readFile((await download.path()) ?? '')
  const archive = await JSZip.loadAsync(data)
  const manifest = JSON.parse((await archive.file('manifest.json')?.async('string')) ?? '{}') as {
    readonly name?: string
    readonly version?: string
    readonly files?: readonly string[]
    readonly editor?: { readonly name?: string }
  }

  // the keys of the mod survive the round through the editor
  expect(manifest.name).toBe('Blank minimal')
  expect(manifest.version).toBe('1.0.0')
  expect(manifest.editor?.name).toBe('arx-fatalis-browser-editor')

  // and the files are the ones of this archive, not the machine paths the base wrote
  expect(manifest.files).toHaveLength(3)

  for (const file of manifest.files ?? []) {
    expect(file.startsWith('/')).toBe(true)
    expect(file).not.toContain('/home/')
  }
})

test('a level of a zip comes back with the steps it was exported with', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, editorLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const whole = await statOf(page, 'Total faces')

  // a step on the level: the face under the crosshair goes
  await lockPointer(page, view)
  await writePose(page, { ...(await readPose(page)), pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBeLessThan(whole ?? 0)

  const edited = await statOf(page, 'Total faces')

  // the export keeps the level the step was made on, and the step itself (the pointer lets go first: a locked pointer
  // never reaches the header)
  await page.evaluate(releaseThePointer)

  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const data = await readFile((await download.path()) ?? '')

  await dialog.locator('.close').click()

  const archive = await JSZip.loadAsync(data)
  const entries = Object.values(archive.files).map((entry) => {
    return entry.name
  })

  expect(
    entries.some((entry) => {
      return entry.startsWith('editor/source/')
    }),
  ).toBe(true)
  expect(entries).toContain('history.json')

  // the zip opens the level as it was left, and the step is a step of it: the undo takes it back
  await openZip(page, 'mod.zip', data)

  await expect
    .poll(async () => {
      return await page.getByRole('combobox', { name: /The maps the editor can open/u }).inputValue()
    })
    .toBe('custom:0')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(edited)

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(whole)
})
