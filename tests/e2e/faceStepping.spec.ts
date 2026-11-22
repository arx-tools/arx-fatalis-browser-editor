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
 * The two steps of the selection: the camera goes to a face of it, one at a time.
 *
 * @remarks
 * The point of the feature is a face no view shows (the four faces without a room of level 1, 2026-11-22): the
 * selection already holds it, the author only has to get there. A step takes the camera to the face and looks at it,
 * and the steps walk the selection in the order of the level and wrap around, so a handful of faces is a ring.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the suite does
 * not keep one (the same reason as `selection.spec.ts`).
 */
test('a step takes the camera to the face of the selection', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset: it has the camera form, which is how the test aims the camera and reads the pose after a step
  await seedLayout(page, layoutWithSelectionInspector())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)

  // one face under the crosshair, then the step: the camera leaves the spawn for the face
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  const spawnPose = JSON.stringify(await readPose(page))

  await page.keyboard.press('.')

  await expect
    .poll(async () => {
      return JSON.stringify(await readPose(page))
    })
    .not.toBe(spawnPose)

  const framed = JSON.stringify(await readPose(page))

  // the selection stays where it was: a step moves the camera, not the faces
  expect(await selectionCount(page)).toBe(1)

  // a ring of one face: the next step is the same face, and the pose stays
  await page.keyboard.press('.')

  await expect
    .poll(async () => {
      return JSON.stringify(await readPose(page))
    })
    .toBe(framed)

  // and the previous step of a ring of one is the same face
  await page.keyboard.press(',')

  await expect
    .poll(async () => {
      return JSON.stringify(await readPose(page))
    })
    .toBe(framed)
})

test('the steps walk a selection of many faces and the previous one goes back', async ({ page, browserName }) => {
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

  // the double click takes the whole area of the face under the crosshair, so the selection has more than one face
  await clickCrosshair(view, { clicks: 2 })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .not.toBe(0)

  await page.keyboard.press('.')

  const first = JSON.stringify(await readPose(page))

  await page.keyboard.press('.')

  const second = JSON.stringify(await readPose(page))

  // the two faces are two places of the level, so the two frames are two poses
  expect(second).not.toBe(first)

  // the previous step takes the camera back to the face it came from
  await page.keyboard.press(',')

  await expect
    .poll(async () => {
      return JSON.stringify(await readPose(page))
    })
    .toBe(first)
})
