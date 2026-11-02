import type { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { seedLayout, statOf, waitForLevel } from './support/editor.ts'

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

/**
 * Picks a zip in the file picker of the header.
 *
 * @param page The page to drive.
 * @param name The name the browser shows for the file.
 * @param content The bytes of the zip.
 */
async function openZip(page: Page, name: string, content: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser')

  await page.locator('header button[aria-label="Open a level from a zip"]').click()

  const fileChooser = await chooser

  await fileChooser.setFiles({ name, mimeType: 'application/zip', buffer: content })
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
