import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { mapSlugOf } from '../../src/editor/modules/level/source/maps/mapId.ts'
import { testLayout } from '../support/layouts.ts'
import { seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The cover of a level load: the step the load is on, and how far it is.
 *
 * @remarks
 * The cover is on the screen for the whole load, and on a level of the game that is ten seconds of work. The test holds
 * the scene of a level back, so the cover is on the screen long enough to be read: what it waits for and the percent of
 * the bar are the two things the author sees while the machine works (2026-11-27).
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

test('the cover says which step the load is on, and how far it is', async ({ page }, testInfo) => {
  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('data'))

  await seedLayout(page, testLayout)

  // the scene of the level is held back: the cover is read while the editor waits for the file. The development server
  // serves the folder on one route, with the path of the file in the query string
  await page.route('**/__local-data**', async (route) => {
    const path = new URL(route.request().url()).searchParams.get('path') ?? ''

    if (path.endsWith('fast.fts')) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1500)
      })
    }

    await route.continue()
  })

  await page.goto(`/?map=${mapSlugOf('arx:0')}&dataDir=${encodeURIComponent(dataDir)}`)

  const overlay = page.locator('.LoadingOverlay')

  await expect(overlay).toBeVisible()
  await expect(overlay.locator('.title')).toHaveText('Loading the level…')
  // the first step is the files: the cover says what the load waits for, with the percentage of the load beside it
  await expect(overlay.locator('.step')).toHaveText(/^Reading the level files… \d+%$/)
  await expect(overlay.locator('.bar .fill')).toBeVisible()

  await waitForLevel(page)
})
