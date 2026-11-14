import { expect, test } from '@playwright/test'
import {
  clickCrosshair,
  editorUrl,
  layoutWithSelectionInspector,
  layoutWithTheKeys,
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
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement === null
      })
    })
    .toBe(true)

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

/**
 * `1` puts the gizmo away, and the selection stays: the key is an edit mode, not a way to drop the faces.
 *
 * @remarks
 * The gizmo stands in the middle of the selection, over the art the author is looking at, so the editor hides it with a
 * key (TODO 185, the first half of the edit modes). The view is the one of the drag above: the same green arrow, pressed
 * after the `1`, must leave the history alone — the arrow of a hidden gizmo is the camera's gesture.
 */
test('1 hides the transform gizmo, and the selection stays', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset with the key table: the row of the mode is part of what the test reads
  await seedLayout(page, layoutWithTheKeys())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const undo = page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]')

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

  // the key help names the key of the mode
  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')
  await expect(keys.locator('dd', { hasText: 'Transform' })).toHaveCount(1)

  // the gizmo can not be grabbed while the camera holds the pointer: let the pointer go
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })
  await page.waitForTimeout(500)

  await page.keyboard.press('1')

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('transformVisible')
      })
    })
    .toBe('false')

  // the arrow that moved the face a moment ago is not there: the same press leaves the history alone
  await page.mouse.move(860, 230)
  await page.mouse.down()
  await page.mouse.move(860, 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)

  await expect(undo).toBeDisabled()
  // and the faces are still the selection
  expect(await selectionCount(page)).toBe(1)

  // the drag above locked the camera on its press: let the pointer go before the arrow is pressed again
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })
  await page.waitForTimeout(500)

  // the eye of the row is the switch of the key: it reads the mode off, and a click brings it back
  const showEye = keys.getByRole('button', { name: 'Show the transform gizmo' })

  await expect(showEye).toHaveAttribute('aria-pressed', 'false')

  await showEye.click()

  await expect(keys.getByRole('button', { name: 'Hide the transform gizmo' })).toHaveAttribute('aria-pressed', 'true')

  // the arrow of the face under the crosshair moves it again: the aim is the one of the click that made the selection
  await writePose(page, spawn)

  await page.mouse.move(860, 230)
  await page.mouse.down()
  await page.mouse.move(860, 150, { steps: 8 })
  await page.mouse.up()

  await expect(undo).toBeEnabled()
})

/**
 * The edit modes are exclusive: `1`, `2` and `3` put one gizmo away and bring another one back.
 *
 * @remarks
 * The gizmos sit on the same faces, so the editor shows one of them or none (TODO 182, the owner): the key of a mode
 * flips it, and the eye of the row does the same. The switches are the rows of the key help, which name the state of a
 * switch in their tooltip ("Show" when it is off, "Hide" when it is on), so the test reads them without a screenshot.
 */
test('the edit modes are exclusive, and the keys and the eyes flip them', async ({ page }) => {
  await seedLayout(page, layoutWithTheKeys())
  await page.goto(editorUrl())

  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')
  const hideTransform = keys.locator('button[aria-label="Hide the transform gizmo"]')
  const showTransform = keys.locator('button[aria-label="Show the transform gizmo"]')
  const hideRotate = keys.locator('button[aria-label="Hide the rotate gizmo"]')
  const showRotate = keys.locator('button[aria-label="Show the rotate gizmo"]')

  // the editor starts with the transform gizmo on and the rotate off
  await expect(hideTransform).toHaveAttribute('aria-pressed', 'true')
  await expect(showRotate).toHaveAttribute('aria-pressed', 'false')

  // `2`: the rotate comes on and the transform goes
  await page.keyboard.press('2')

  await expect(hideRotate).toHaveAttribute('aria-pressed', 'true')
  await expect(showTransform).toHaveAttribute('aria-pressed', 'false')

  // `1`: back to the transform
  await page.keyboard.press('1')

  await expect(hideTransform).toHaveAttribute('aria-pressed', 'true')
  await expect(showRotate).toHaveAttribute('aria-pressed', 'false')

  // `1` again: neither gizmo, the selection stays
  await page.keyboard.press('1')

  await expect(showTransform).toHaveAttribute('aria-pressed', 'false')
  await expect(showRotate).toHaveAttribute('aria-pressed', 'false')

  // the eye of the row is the same switch: a click on the rotate brings it in, and the transform stays out
  await showRotate.click()

  await expect(hideRotate).toHaveAttribute('aria-pressed', 'true')
  await expect(showTransform).toHaveAttribute('aria-pressed', 'false')

  // the two switches are remembered by the browser
  const stored = await page.evaluate(() => {
    return { transform: localStorage.getItem('transformVisible'), rotate: localStorage.getItem('rotateVisible') }
  })

  expect(stored).toEqual({ transform: 'false', rotate: 'true' })
})
