import { expect, test } from '@playwright/test'
import {
  clickCrosshair,
  editorUrl,
  layoutWithSelectionInspector,
  lockPointer,
  readPose,
  seedLayout,
  selectionCount,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The move gizmo of the walkable view: the drag of an axis, the step it leaves and the undo of it.
 *
 * @remarks
 * The gizmo is a `TransformControls` at the middle of the selection, so its arrows are at a place of the view, not in
 * the DOM: the test presses the green one at the pixels the editor layout of the level 8 puts it on. The pointer has to
 * be free to grab it, so the test releases the lock the way the browser does (Escape is the user's way, the page's is
 * the same event). The firefox of the suite does not keep a pointer lock, so the test runs in chromium.
 */
test('the gizmo moves the selected face, and the undo takes it back', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const undo = page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]')
  const redo = page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Redo"]')

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the selection is not a step of the history: only the drag is
  await expect(undo).toBeDisabled()

  // the gizmo is drawn while the camera holds the pointer, but it can not be grabbed: let the pointer go
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })
  await page.waitForTimeout(500)

  // the green arrow of the gizmo, from the middle of the face up
  await page.mouse.move(860, 230)
  await page.mouse.down()
  await page.mouse.move(860, 150, { steps: 8 })
  await page.mouse.up()

  await expect(undo).toBeEnabled()

  await page.keyboard.press('ControlOrMeta+z')
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()

  await page.keyboard.press('ControlOrMeta+y')
  await expect(undo).toBeEnabled()
})
