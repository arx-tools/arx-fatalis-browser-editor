import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import JSZip from 'jszip'
import { editorLayout, roomsLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import {
  E2E_LEVEL,
  editorUrl,
  openZip,
  readPose,
  seedLayout,
  waitForLevel,
  waitForUrlPose,
  writePose,
} from './support/editor.ts'

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

  // the close button keeps the right edge of the header, and the title the left one: the button is not after the title
  // (it was, in a dialog without title actions, because the free space was made by those)
  const head = dialog.locator('.head')
  const title = head.locator('h2')
  const close = head.locator('.close')
  const titleBox = await title.boundingBox()
  const closeBox = await close.boundingBox()
  const headBox = await head.boundingBox()

  expect(titleBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  expect(headBox).not.toBeNull()

  if (titleBox !== null && closeBox !== null && headBox !== null) {
    expect(titleBox.x).toBeLessThan(headBox.x + 40)
    expect(closeBox.x + closeBox.width).toBeGreaterThan(headBox.x + headBox.width - 20)
  }

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

  // the level 13 of the dialog, and the author of the archive
  await index.fill('13')

  await dialog.locator('#export-author-name').fill("Lali's Workbench")
  await dialog.locator('#export-homepage').fill('https://example.com/lali')

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])

  expect(download.suggestedFilename()).toBe('mod.zip')

  const path = await download.path()
  const archive = await JSZip.loadAsync(await readFile(path ?? ''))
  const entries = Object.values(archive.files).map((entry) => {
    return entry.name
  })

  // the files are under the index of the dialog, and the manifest says what the level is made with
  expect(entries).toContain('game/graph/levels/level13/fast.fts')
  expect(entries).toContain('graph/levels/level13/level13.dlf')
  expect(entries).toContain('graph/levels/level13/level13.llf')
  expect(entries).toContain('manifest.json')

  const manifest = JSON.parse((await archive.file('manifest.json')?.async('string')) ?? '{}') as {
    readonly seed?: number
    readonly files?: readonly string[]
  }

  expect(manifest.seed).toBe(Number(seed))
  expect(manifest.files).toContain('game/graph/levels/level13/fast.fts')

  // the manifest says which build of the editor wrote the archive, with its code: one signing key, not two
  const signed = manifest as unknown as {
    readonly generator?: string
    readonly editor?: {
      readonly name?: string
      readonly version?: string
      readonly commit?: string
      readonly builtAt?: string
      readonly url?: string
      readonly exportedAt?: string
    }
  }

  expect(signed.generator).toBeUndefined()
  expect(signed.editor?.name).toBe('arx-fatalis-browser-editor')
  expect(signed.editor?.version).toMatch(/^\d+\.\d+\.\d+/u)
  expect(signed.editor?.commit).toMatch(/^(?:[0-9a-f]{7}|local)$/u)
  expect(signed.editor?.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u)
  expect(signed.editor?.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u)

  // the list of the files is the whole archive, the manifest itself excepted
  expect(manifest.files).toContain('editor/settings.json')

  // the author is a block of its own, and the page of the level goes under the project
  expect((manifest as unknown as { readonly author?: unknown }).author).toEqual({ name: "Lali's Workbench" })
  expect((manifest as unknown as { readonly project?: unknown }).project).toEqual({
    homepage: 'https://example.com/lali',
  })

  // the end of the export is on the button of the dialog
  await expect(dialog.locator('.export')).toHaveText('Downloaded')
})

test('a level of a zip opens on the camera pose the export wrote', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)
  // the view the level is left at: the link carries it, so the store of the camera has it from the load, and the export
  // reads the store (the form reaches it through a debounce, which a write just before a click can lose)
  await page.goto('/?map=blank-flat&position=120,-60,430&rotation=10,45,0')
  await waitForLevel(page)

  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const data = await readFile((await download.path()) ?? '')
  const archive = await JSZip.loadAsync(data)
  const settings = JSON.parse((await archive.file('editor/settings.json')?.async('string')) ?? '{}') as {
    readonly camera?: { readonly position?: readonly number[]; readonly rotation?: readonly number[] }
  }

  // the camera of the level is in the settings of the editor, and it is not the spawn of the player
  expect(settings.camera?.position?.[0]).toBeCloseTo(120, 1)
  expect(settings.camera?.position?.[1]).toBeCloseTo(-60, 1)
  expect(settings.camera?.position?.[2]).toBeCloseTo(430, 1)
  expect(settings.camera?.rotation?.[1]).toBeCloseTo(45, 1)

  // the dialog goes, and the camera is taken somewhere else: the pose of the archive is not the one on the screen any more
  await dialog.locator('.close').click()

  await writePose(page, { x: '550', y: '-180', z: '550', pitch: '0', yaw: '180', roll: '0' })
  // the camera store follows the form through a debounce, and the url is the mirror of it
  await waitForUrlPose(page, [550, -180, 550])

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

/**
 * The names of the rooms and the groups of the faces travel in the archive, and come back with it.
 *
 * @remarks
 * Both are the editor's metadata: they go into `editor/rooms.json` and `editor/groups.json`, and a zip that carries them
 * opens with the names and the groups on the level. The test makes the two on the flat level, exports it, reads the two
 * files out of the bytes, and opens the archive again.
 */
test('the names of the rooms and the groups travel in the zip, and come back with it', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  // the room inspector of the rooms preset, and the group inspector through the picker
  await seedLayout(page, roomsLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  await page.locator('button[aria-label="Add a widget"]').click()

  const picker = page.locator('.WidgetPicker [data-picker-kind="group-inspector"]')
  const pickerBox = await picker.boundingBox()
  const view = page.locator('[data-widget-kind="3d-view"]').first()
  const viewBox = await view.boundingBox()

  if (pickerBox === null || viewBox === null) {
    throw new Error('the picker or the view has no box')
  }

  const pickerHalfWidth = pickerBox.width / 2
  const pickerHalfHeight = pickerBox.height / 2
  const viewHalfWidth = viewBox.width / 2
  const viewHalfHeight = viewBox.height / 2
  const pickerX = pickerBox.x + pickerHalfWidth
  const pickerY = pickerBox.y + pickerHalfHeight
  const viewX = viewBox.x + viewHalfWidth
  const viewY = viewBox.y + viewHalfHeight

  await page.mouse.move(pickerX, pickerY)
  await page.mouse.down()
  await page.mouse.move(pickerX + 20, pickerY, { steps: 5 })
  await page.mouse.move(viewX, viewY, { steps: 15 })
  await page.mouse.up()

  const roomRow = page.locator('[data-widget-kind="room-inspector"] li.room').first()

  await roomRow.click()
  await page.keyboard.press('ControlOrMeta+g')

  // a name for the room and a name for the group
  await roomRow.dblclick()

  const roomField = roomRow.locator('.rename')

  await roomField.fill('Hall')
  await roomField.press('Enter')

  const groupRow = page.locator('[data-widget-kind="group-inspector"] li.group').first()

  await groupRow.dblclick()

  const groupField = groupRow.locator('.rename')

  await groupField.fill('Floor')
  await groupField.press('Enter')

  // the export, and the two files of the metadata in the archive
  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')

  await expect(dialog).toBeVisible()

  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const data = await readFile((await download.path()) ?? '')
  const archive = await JSZip.loadAsync(data)
  const rooms = JSON.parse((await archive.file('editor/rooms.json')?.async('string')) ?? '{}') as {
    readonly roomNames?: Readonly<Record<string, string>>
  }
  const groups = JSON.parse((await archive.file('editor/groups.json')?.async('string')) ?? '{}') as {
    readonly groups?: ReadonlyArray<{ readonly name: string }>
  }

  expect(rooms.roomNames?.['1']).toBe('Hall')
  expect(groups.groups?.[0]?.name).toBe('Floor')

  // the dialog goes: the header takes the click of the zip
  await dialog.locator('.close').click()

  // opening the archive again finds the two
  await openZip(page, 'mod.zip', data)
  await waitForLevel(page)

  await expect(page.locator('[data-widget-kind="room-inspector"] li.room').first()).toContainText('Hall')
  await expect(page.locator('[data-widget-kind="group-inspector"] li.group').first()).toContainText('Floor')
})
