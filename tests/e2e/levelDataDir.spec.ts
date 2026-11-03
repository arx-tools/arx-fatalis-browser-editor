import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { seedLayout, statOf, waitForLevel } from './support/editor.ts'

/**
 * The data directory of the game, through the button of the header and the url.
 *
 * @remarks
 * The editor reads the level files and the textures of the game from the folder the url names (`?dataDir=`), which the
 * development server serves (the page can not read the disk). The test builds a small data directory of its own, so it
 * needs no game of the machine it runs on.
 */
test.setTimeout(120_000)

/**
 * Writes the three files of the minimal blank level as a data directory.
 *
 * @param root The folder the data directory is built in.
 *
 * @returns The folder, ready for the `dataDir` parameter.
 */
async function dataDirOfABlankLevel(root: string): Promise<string> {
  const files = createBlankLevelFiles(MINIMAL_PRESET)
  const folder = join(root, 'graph', 'levels', 'level0')

  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, 'fast.fts'), Buffer.from(files.fts))
  await writeFile(join(folder, 'level0.dlf'), Buffer.from(files.dlf))
  await writeFile(join(folder, 'level0.llf'), Buffer.from(files.llf))

  return root
}

test('a level opens from the data directory of the url', async ({ page }, testInfo) => {
  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('data'))

  await seedLayout(page, editorLayout)
  await page.goto(`/?fromOriginalArxLevel=0&dataDir=${encodeURIComponent(dataDir)}`)
  await waitForLevel(page)

  // the level of the folder is the minimal blank one: one face, not the 121 of the blank level of the editor
  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(1)
})

test('a data directory without the level says what happened', async ({ page }, testInfo) => {
  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('empty'))

  await seedLayout(page, editorLayout)

  // the folder has the level 0, the url asks for the level 8: a level named in a data directory is not silently a blank
  await page.goto(`/?fromOriginalArxLevel=8&dataDir=${encodeURIComponent(dataDir)}`)

  await expect(page.locator('[data-widget-kind="3d-view"] .status')).toContainText('has no level 8')
})

test('the data directory of the header opens the level of the url', async ({ page, browserName }, testInfo) => {
  // a `webkitdirectory` input keeps the relative path of a file only when the **user** picks the folder: chromium
  // drops the paths of the files a test assigns, so the folder of the header can not be driven there. Firefox keeps
  // them; the handler itself is covered by the unit tests of `dataDir.ts`.
  test.skip(browserName === 'chromium', 'chromium drops the relative paths of the assigned files')

  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('header-data'))

  await seedLayout(page, editorLayout)

  // the url names the level, but the folder it names is not there: the walkable view says so
  await page.goto(`/?fromOriginalArxLevel=0&dataDir=${encodeURIComponent('/no/such/folder')}`)
  await expect(page.locator('[data-widget-kind="3d-view"] .status')).toContainText('has no level 0')

  // the folder button of the header is there, and its input takes a whole directory
  await expect(page.locator('header button[aria-label="Pick the data directory of the game"]')).toBeVisible()

  // the folder picker itself is the browser's; the test gives the input the list a pick would (the relative paths and
  // the files), because a directory upload is not the same call in every engine
  const entries = await Promise.all(
    ['fast.fts', 'level0.dlf', 'level0.llf'].map(async (name) => {
      const bytes = await readFile(join(dataDir, 'graph', 'levels', 'level0', name))

      return {
        name,
        path: `header-data/graph/levels/level0/${name}`,
        base64: Buffer.from(bytes).toString('base64'),
      }
    }),
  )

  await page.locator('header input[aria-label="The data directory of the game"]').evaluate((input, list) => {
    // the window of the input, so the test does not reach for the globals of the page
    const view = input.ownerDocument.defaultView

    if (view === null) {
      return
    }

    const transfer = new view.DataTransfer()

    for (const entry of list) {
      const bytes = view.Uint8Array.from(view.atob(entry.base64), (character) => {
        return character.codePointAt(0) ?? 0
      })
      const file = new view.File([bytes], entry.name)

      Object.defineProperty(file, 'webkitRelativePath', { value: entry.path })
      transfer.items.add(file)
    }

    const element = input as HTMLInputElement

    element.files = transfer.files
    element.dispatchEvent(new view.Event('change', { bubbles: true }))
  }, entries)

  // the level of the url loads from the folder of the header, no url change needed
  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(1)
})
