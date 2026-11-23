import { expect, test } from '@playwright/test'
import {
  clickCrosshairUntilSelected,
  editorUrl,
  layoutWithSelectionInspector,
  litPixels,
  lockPointer,
  nextFrames,
  readPose,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The deletion of the selected faces.
 *
 * @remarks
 * The level comes from the fixture data dir of the run (`editorUrl`): the folder is what a level of the game opens
 * from, and the fixture is the same level the specs measure on. The test runs only in chromium: the walkable view
 * selects with a pointer lock, and the headless firefox of the suite does not keep one.
 */
test('a deleted face leaves the rest of the level on the screen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset: it has the camera form, which is how the test aims the camera again after the lock
  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const total = await waitForLevel(page)
  const litBefore = await litPixels(view)

  // take the face under the crosshair, and delete it: the lock click turns the camera, so the aim is written
  // back into the camera form first (the spawn pose, read before the lock)
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  const selected = await clickCrosshairUntilSelected(page, view)

  await page.keyboard.press('Delete')

  // the model follows: the faces are gone, and the selection is empty
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(total - selected)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  // a second one: the indices moved with the first delete, and the geometry is cut again, so this is where a
  // stale triangle map or a half-cut buffer would show. The face the crosshair was on is gone — the ray finds the
  // hole now — so the camera turns to another wall of the room through its form first (a click on a fixed view
  // would go to the locked canvas, the pointer lock is still on)
  const afterFirst = await statOf(page, 'Total faces')
  const pose = await readPose(page)
  const turned = (Number(pose.yaw) + 90) % 360

  // the pitch looks down: the face under the crosshair is a floor tile of the room, and the view of the room stays whole
  // (a wall in the middle of the view would leave its hole as the picture)
  await writePose(page, { ...pose, pitch: '45.00', yaw: turned.toFixed(2) })

  // the view has to draw the new aim before the press picks with it: the pose write moves the camera, and the raycast
  // reads the matrix of the last frame (measured: the press a frame too early found the hole of the first delete)
  await nextFrames(page, 3)

  const secondSelected = await clickCrosshairUntilSelected(page, view)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe((afterFirst ?? 0) - secondSelected)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  // and so does the picture: the level lost two faces, not itself. The paint of the cut geometry builds the mesh again in
  // a frame of its own, and a picture taken in that frame is black: the view is read until it holds the level again
  let litAfter = await litPixels(view)

  for (let attempt = 0; attempt < 5 && litAfter <= litBefore * 0.5; attempt++) {
    await page.waitForTimeout(200)
    litAfter = await litPixels(view)
  }

  expect(litAfter).toBeGreaterThan(litBefore * 0.5)
})
