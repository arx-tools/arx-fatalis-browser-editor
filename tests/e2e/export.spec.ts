import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { E2E_LEVEL, editorUrl, openZip, readPose, seedLayout, waitForLevel, writePose } from './support/editor.ts'

/**
 * The export: a dialog with the two values a mod is known by, and the archive the panel of the header used to write.
 *
 * @remarks
 * The owner's request (2026-11-06): the button opens a dialog first, so the **seed** (the one the url carries) and the
 * **level index** (the one the level was opened with) are the last look at the level before the bytes are written. The
 * index changes the paths inside the archive and the header of the description; the seed goes into the `manifest.json`
 * the loader of the zips reads. The archive is built from the map in the memory, so the test only needs the level on
 * the screen.
 */
test.setTimeout(120_000)

test('the export dialog writes the level under the fields of the dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  await seedLayout(page, editorLayout)

  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')

  await expect(dialog).toBeVisible()

  // the seed of the url: the level of the test is opened without one, so the level made its own, and the url carries it
  const seed = await dialog.locator('#export-seed').inputValue()

  expect(seed).toMatch(/^\d+$/u)

  // the index field starts with the index the level was opened with
  const index = dialog.locator('#export-level-index')

  await expect(index).toHaveValue(String(E2E_LEVEL))

  // the two helper lines of the dialog: the seed, and how the game loads the map at the start of a quest
  await expect(dialog.locator('.helper').first()).toHaveText(
    'Used by the random number generator. Use any text as a seed, otherwise a number between 100.000.000 and 999.999.999 is automatically assigned.',
  )
  await expect(dialog.locator('.helper').nth(1)).toHaveText(
    'Set to 1 to make Arx Fatalis load the map upon starting a new quest.',
  )

  // the bar of the progress keeps its place while nothing runs, so the dialog does not jump
  await expect(dialog.locator('.progress')).toHaveClass(/is-hidden/u)

  // the level 13 of the dialog
  await index.fill('13')

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])

  expect(download.suggestedFilename()).toBe('mod.zip')

  const path = await download.path()
  const archive = await JSZip.loadAsync(await readFile(path ?? ''))
  const entries = Object.values(archive.files).map((entry) => {
    return entry.name
  })

  // the files are under the index of the dialog, and the manifest says what the level is made with
  expect(entries).toContain('/game/graph/levels/level13/fast.fts')
  expect(entries).toContain('/graph/levels/level13/level13.dlf')
  expect(entries).toContain('/graph/levels/level13/level13.llf')
  expect(entries).toContain('manifest.json')

  const manifest = JSON.parse((await archive.file('manifest.json')?.async('string')) ?? '{}') as {
    readonly seed?: number
    readonly files?: readonly string[]
  }

  expect(manifest.seed).toBe(Number(seed))
  expect(manifest.files).toContain('/game/graph/levels/level13/fast.fts')

  // the manifest says which generator made the level, and which build of the editor wrote the archive, with its code
  const signed = manifest as unknown as {
    readonly generator?: string
    readonly generatorVersion?: string
    readonly generatorUrl?: string
    readonly editor?: {
      readonly name?: string
      readonly version?: string
      readonly commit?: string
      readonly builtAt?: string
      readonly url?: string
      readonly exportedAt?: string
    }
  }

  expect(signed.generator).toBe('arx-level-generator2')
  expect(signed.generatorVersion).toMatch(/^\d+\.\d+\.\d+/u)
  expect(signed.generatorUrl).toBe('https://github.com/arx-tools/arx-fatalis-browser-editor')
  expect(signed.editor?.name).toBe('arx-fatalis-browser-editor')
  expect(signed.editor?.version).toMatch(/^\d+\.\d+\.\d+/u)
  expect(signed.editor?.commit).toMatch(/^(?:[0-9a-f]{7}|local)$/u)
  expect(signed.editor?.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  expect(signed.editor?.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)

  // the end of the export is on the button of the dialog
  await expect(dialog.locator('.export')).toHaveText('Downloaded')
})

test('a level of a zip opens on the camera pose the export wrote', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  // the view the level is left at
  const pose = { x: '120', y: '-60', z: '430', pitch: '10', yaw: '45', roll: '0' }

  await writePose(page, pose)

  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const data = await readFile((await download.path()) ?? '')
  const archive = await JSZip.loadAsync(data)
  const manifest = JSON.parse((await archive.file('manifest.json')?.async('string')) ?? '{}') as {
    readonly camera?: { readonly position?: readonly number[]; readonly rotation?: readonly number[] }
  }

  // the camera of the level is in the manifest, and it is not the spawn of the player
  expect(manifest.camera?.position?.[0]).toBeCloseTo(120, 1)
  expect(manifest.camera?.position?.[1]).toBeCloseTo(-60, 1)
  expect(manifest.camera?.position?.[2]).toBeCloseTo(430, 1)
  expect(manifest.camera?.rotation?.[1]).toBeCloseTo(45, 1)

  // the dialog goes, and the camera is taken somewhere else: the pose of the archive is not the one on the screen any more
  await dialog.locator('.close').click()

  await writePose(page, { x: '550', y: '-180', z: '550', pitch: '0', yaw: '180', roll: '0' })

  // the zip opens on the pose it was written with
  await openZip(page, 'mod.zip', data)

  await expect
    .poll(async () => {
      const shown = await readPose(page)

      return [shown.x, shown.y, shown.z, shown.yaw]
    })
    .toEqual(['120.00', '-60.00', '430.00', '45.00'])

  await expect(page.getByRole('combobox', { name: /The maps the editor can open/u })).toHaveValue('custom:0')
})
