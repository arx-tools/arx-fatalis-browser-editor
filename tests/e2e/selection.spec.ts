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
 * The selection of the walkable view: what the crosshair is on, and what the gestures do with it.
 *
 * @remarks
 * The level comes over the network, the way the deployed editor downloads it (there is a note about that in the
 * spec of the deletion). The gestures are dispatched by the page instead of by playwright, because a real mouse
 * event under a pointer lock also reports a movement and turns the camera — see `clickCrosshair`.
 *
 * What this test can not do is aim: the camera of a locked view only turns with the mouse, so the face under
 * the crosshair is the one the view happens to look at, and no gesture can be pointed at a place where the ray
 * meets two faces. That case — a face the selection holds, with another one behind it — is the one the bug of
 * 2026-10-31 was about, and it is covered by the unit tests of `faceToSweep` (two candidates, the first one
 * selected). This test covers the wiring around it: the click takes one face, `shift` on the same face leaves
 * the count alone, `ctrl` takes it away, and the area click still adds the same-texture neighbors.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the
 * suite does not keep one.
 */
test('the face under the crosshair is the one a gesture takes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset: it has the camera form, which is how the test aims the camera again after the lock
  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  // the spawn pose of the level, read before the lock: the click that takes the lock also turns the camera
  const spawn = await readPose(page)

  // the pointer lock, and nothing else: the press that asks for it still finds the pointer free
  await lockPointer(page, view)
  expect(await selectionCount(page)).toBe(0)

  // the aim goes back to the spawn: the crosshair sits on a face of the level whatever the click did
  await writePose(page, spawn)

  // a plain click takes the face under the crosshair
  await clickCrosshair(view)
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the same face again with shift changes nothing: the face is in the selection already, and a gesture that
  // takes nothing leaves the count alone (the unit tests of `faceToSweep` are the ones that pin down where the
  // walk of the ray stops when another face lies behind this one)
  await clickCrosshair(view, { shift: true })
  expect(await selectionCount(page)).toBe(1)

  // ctrl takes the face away: the ray stops at the face in front of it, whatever the gesture does
  await clickCrosshair(view, { ctrl: true })
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  // the area click still works: a double click takes the whole same-texture area of the face under the
  // crosshair, and with shift it adds it to the selection it meets (one face here). The face in the middle of
  // level 8 has eighteen faces of its own texture: the number itself is left loose, so another level fits
  await clickCrosshair(view, { shift: true, clicks: 2 })
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(1)
})

/**
 * The selection inspector opens its rows into the ids of the faces and the textures.
 *
 * @remarks
 * The two rows at the top are accordions (2026-11-16, the owner): the whole row toggles, the arrow at its end turns, and
 * both can be open at once. The textures start open (the widget used to show them), the ids of the faces start closed.
 * The ids are the raw indices of the level, the ids the delete and the selection use, so the test reads a number.
 *
 * The walkable view selects with a pointer lock, so the test runs in chromium, the way the other selection tests do.
 */
test('the selection inspector opens the face ids and the textures', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

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

  // the camera holds the pointer: let it go, or the click of a row never reaches the widget
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })
  await page.waitForTimeout(500)

  const widget = page.locator('[data-widget-kind="selection-inspector"]')
  const facesRow = widget.locator('.AccordionRow', { hasText: 'Face Indices' }).locator('.head')
  const texturesRow = widget.locator('.AccordionRow', { hasText: 'Textures' }).locator('.head')

  // the textures open by default, the ids wait for a click
  await expect(facesRow).toHaveAttribute('aria-expanded', 'false')
  await expect(texturesRow).toHaveAttribute('aria-expanded', 'true')

  // the whole row opens: the triangle is on the value side, and the click goes through it. The value is in the head of
  // the row, so the click on the number (and the triangle) is the one the reader makes.
  const texturesValue = texturesRow.locator('.value')

  await texturesValue.click()
  await expect(texturesRow).toHaveAttribute('aria-expanded', 'false')
  await expect(widget.locator('.groups .group')).toHaveCount(0)

  await facesRow.click()
  await expect(facesRow).toHaveAttribute('aria-expanded', 'true')

  const faceIds = widget.locator('.faces li')

  await expect(faceIds).toHaveCount(1)
  await expect(faceIds.first()).toHaveText(/^\d+$/u)

  // both can be open at the same time: the textures come back under the ids, and the ids stay
  await texturesValue.click()
  await expect(texturesRow).toHaveAttribute('aria-expanded', 'true')
  await expect(widget.locator('.groups .group').first()).toBeVisible()
  await expect(faceIds).toHaveCount(1)
})
