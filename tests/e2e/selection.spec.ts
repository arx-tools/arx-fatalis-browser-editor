import { expect, test } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { clickCrosshair, lockPointer, readPose, seedLayout, statOf, waitForLevel, writePose } from './support/editor.ts'

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
 * the count alone, `ctrl` takes it away, and the area click still adds the same-texture neighbours.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the
 * suite does not keep one.
 */
test('the face under the crosshair is the one a gesture takes', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset: it has the camera form, which is how the test aims the camera again after the lock
  await seedLayout(page, editorLayout)
  await page.goto('/')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  // the spawn pose of the level, read before the lock: the click that takes the lock also turns the camera
  const spawn = await readPose(page)

  // the pointer lock, and nothing else: the press that asks for it still finds the pointer free
  await lockPointer(page, view)
  expect(await statOf(page, 'Selected faces')).toBe(0)

  // the aim goes back to the spawn: the crosshair sits on a face of the level whatever the click did
  await writePose(page, spawn)

  // a plain click takes the face under the crosshair
  await clickCrosshair(view)
  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBe(1)

  // the same face again with shift changes nothing: the face is in the selection already, and a gesture that
  // takes nothing leaves the count alone (the unit tests of `faceToSweep` are the ones that pin down where the
  // walk of the ray stops when another face lies behind this one)
  await clickCrosshair(view, { shift: true })
  expect(await statOf(page, 'Selected faces')).toBe(1)

  // ctrl takes the face away: the ray stops at the face in front of it, whatever the gesture does
  await clickCrosshair(view, { ctrl: true })
  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBe(0)

  // the area click still works: a double click takes the whole same-texture area of the face under the
  // crosshair, and with shift it adds it to the selection it meets (one face here). The face in the middle of
  // level 8 has eighteen faces of its own texture: the number itself is left loose, so another level fits
  await clickCrosshair(view, { shift: true, clicks: 2 })
  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBeGreaterThan(1)
})
