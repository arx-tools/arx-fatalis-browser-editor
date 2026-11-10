import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { createBlankLevelFiles, MINIMAL_PRESET } from '../../src/editor/modules/level/blankLevel.ts'

/**
 * The setup dialog of the data directory, and the ways it gives the folder (2026-11-10, the owner's request).
 *
 * @remarks
 * The folder of the **url** is remembered in the local storage, the **files of a folder** are a snapshot of the session,
 * and a **path typed in the dialog** is the way a browser without the directory picker (Firefox) keeps the folder. The
 * dialog says which one the user has, and the path of it when it knows one: the browser does not give the absolute path
 * of a folder it picks.
 *
 * The directory picker of the File System Access API opens a window of the system, which no test can drive: its way is
 * covered by the unit tests of the module, with a fake handle.
 */
test.setTimeout(120_000)

/**
 * Writes the three files of the minimal blank level as a data directory.
 *
 * @param root The folder the data directory is built in.
 *
 * @returns The folder, ready for the `dataDir` parameter and for the folder input.
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

test('the dialog sets the path of the input, and forgets it again', async ({ page }, testInfo) => {
  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('data'))

  await page.goto('/?map=blank-flat')
  await page.waitForTimeout(800)

  await page.locator('.DataDirPicker > button').click()

  // the link is the name of the wiki, and the sentence around it says what it is for
  await expect(page.locator('.read-more')).toHaveText('Read more about data directories on the Arx Libertatis wiki.')
  await expect(page.locator('.read-more .text-link')).toHaveText('Arx Libertatis wiki')

  // the video at the bottom of the dialog is the same kind of link
  await expect(page.locator('.video')).toContainText('how to extract the assets of the game')
  await expect(page.locator('.video .text-link')).toHaveText('in this video')

  // the note of the browse button tells how long the folder of the browser lives
  const remembered = await page.evaluate(() => {
    return typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  })

  let note = '(temporary, will get forgotten on next page load)'

  if (remembered) {
    note = '(remembered by the browser)'
  }

  await expect(page.locator('button.browse')).toContainText(note)

  // the input says the shape of the folder the game has on windows, and the dialog is the wider box
  await expect(page.locator('.path-input')).toHaveAttribute(
    'placeholder',
    String.raw`e.g. C:\Users\<Username>\Saved Games\Arx Libertatis\unpacked`,
  )

  // the path of the input is the folder, and the dialog shows it whole
  await page.locator('.path-input').fill(dataDir)
  await page.locator('.path-row .apply').click()
  await page.waitForTimeout(1200)

  await expect(page.locator('.state-panel .state-title')).toHaveText('The Arx data dir is set')
  await expect(page.locator('.state-panel .state-name')).toHaveText(dataDir)
  expect(
    await page.evaluate(() => {
      return localStorage.getItem('arx-data-dir')
    }),
  ).toBe(dataDir)

  // and it goes: the storage, the state and the header's button
  await page.locator('.path-row .forget').click()
  await page.waitForTimeout(800)

  await expect(page.locator('.state-panel .state-title')).toHaveText('No Arx data dir yet')
  await expect(page.locator('.state-panel .state-name')).toHaveCount(0)
  expect(
    await page.evaluate(() => {
      return localStorage.getItem('arx-data-dir')
    }),
  ).toBeNull()
})

test('the files of a folder are a temporary data dir', async ({ page, browserName }, testInfo) => {
  // the upload of a directory is the way of a browser without the picker, and Playwright fills the input in Firefox only
  test.skip(browserName !== 'firefox', 'the directory upload of the suite works in Firefox here')

  const dataDir = await dataDirOfABlankLevel(testInfo.outputPath('data'))

  await page.goto('/?map=blank-flat')
  await page.waitForTimeout(800)

  await page.locator('.DataDirPicker > button').click()
  await page.locator('.dir-input').setInputFiles(dataDir)
  await page.waitForTimeout(1500)

  await expect(page.locator('.state-panel .state-title')).toHaveText('The Arx data dir is set')
  await expect(page.locator('.state-panel .state-name')).toHaveText('data')
  await expect(page.locator('.state-panel .state-note')).toHaveText('(temporary, will get forgotten on next page load)')

  // the files of the session are not a path: nothing goes to the storage
  expect(
    await page.evaluate(() => {
      return localStorage.getItem('arx-data-dir')
    }),
  ).toBeNull()
})
