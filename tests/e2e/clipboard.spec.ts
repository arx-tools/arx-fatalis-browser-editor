import { expect, test } from '@playwright/test'
import {
  clickCrosshair,
  layoutWithSelectionInspector,
  lockPointer,
  readPose,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The clipboard of the editor: the copy of the selected faces and the paste of them.
 *
 * @remarks
 * The first slice puts the pasted faces where they were copied from, and selects them. A second paste comes from the
 * clipboard, not from the selection, so the count grows without a new copy. The cross-level paste (the spawn, no room,
 * the missing textures added) is the next slice of the ticket.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the suite does
 * not keep one.
 */
test('the copied face pastes at its place, is selected, and the undo takes it back', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the preset with the camera form (the aim goes back after the lock), the statistics and the selection inspector
  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto('/?map=blank-flat&position=550,-180,550&rotation=35,180,0')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const spawn = await readPose(page)

  await lockPointer(page, view)

  // the browser locks the pointer asynchronously: the click of the crosshair has to wait for it
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement !== null
      })
    })
    .toBe(true)

  // the click that takes the lock turns the camera: the crosshair goes back to the pose of the link
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  const faces = (await statOf(page, 'Total faces')) ?? 0

  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(faces + 1)

  // the pasted face is the selection: the move gizmo takes it without a click
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // a second paste comes from the clipboard, not from the selection
  await page.keyboard.press('Control+v')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(faces + 2)

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(faces + 1)

  await page.keyboard.press('Control+y')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(faces + 2)
})
