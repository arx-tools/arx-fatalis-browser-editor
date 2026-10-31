import { expect, test, type Response } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import {
  clickCrosshair,
  litPixels,
  lockPointer,
  readPose,
  seedLayout,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The deletion of the selected faces.
 *
 * @remarks
 * The level comes over the network, from the repository the deployed editor downloads it from too. That is
 * deliberate: this is the only test that needs a real level, and the download is a part of the product that
 * can break on its own (the shape of the urls, the headers of the cdn, a moved file), which a level served
 * from the disk of the checkout would hide. So the test waits for the download instead of mocking it, and it
 * checks that the three files of the level arrived with a 200 before it clicks anything.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the
 * suite does not keep one.
 */
test('a deleted face leaves the rest of the level on the screen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the three files of the level, as they arrive: the test asserts them after the map is on
  const downloads: Response[] = []

  page.on('response', (response) => {
    if (/\/arx-fatalis\/level\d+\//u.test(response.url())) {
      downloads.push(response)
    }
  })

  // the editor preset: it has the camera form, which is how the test aims the camera again after the lock
  await seedLayout(page, editorLayout)
  await page.goto('/')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  // and it came whole: three files, all of them read (the order of the three fetches is not fixed)
  const statuses = downloads.map((response) => {
    return response.status()
  })

  expect(statuses).toEqual([200, 200, 200])

  const total = await waitForLevel(page)
  const litBefore = await litPixels(view)

  // take the face under the crosshair, and delete it: the lock click turns the camera, so the aim is written
  // back into the camera form first (the spawn pose, read before the lock)
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBeGreaterThan(0)

  const selected = (await statOf(page, 'Selected faces')) ?? 0

  await page.keyboard.press('Delete')

  // the model follows: the faces are gone, and the selection is empty
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(total - selected)

  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBe(0)

  // and so does the picture: the level lost a face, not itself
  const litAfter = await litPixels(view)

  expect(litAfter).toBeGreaterThan(litBefore * 0.5)
})
