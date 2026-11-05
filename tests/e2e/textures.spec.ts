import { expect, test } from '@playwright/test'
import {
  clickCrosshair,
  editorUrl,
  lockPointer,
  painterLayout,
  readPose,
  seedLayout,
  selectionCount,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The texture list: a click paints the selected faces, and the history takes it back.
 *
 * @remarks
 * The level comes over the network, the way the deployed editor downloads it (there is a note about that in the spec of
 * the deletion). It comes **without a data directory**, which is what a test can rely on: the game's own textures are
 * not read, so the list holds the placeholder of the generator and nothing else — the texture the level paints a face
 * with is not found by any source, and the selection inspector says so (`Missing`).
 *
 * The gesture that takes a face is the one of the selection spec (the events are dispatched by the page, because a
 * pointer lock turns every real mouse event into a movement). The **click on a tile** is a real one: the pointer is let
 * go first, so the click reaches the button.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the suite does
 * not keep one.
 */
test('a click on a texture paints the selected faces, and the history takes it back', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the editor preset, with the two widgets of the round: the selection inspector and the texture list
  await seedLayout(page, painterLayout())
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const textures = page.locator('[data-widget-kind="textures"]')
  const inspector = page.locator('[data-widget-kind="selection-inspector"]')

  await expect(textures).toBeVisible()
  await expect(inspector).toBeVisible()

  // the line over the list says what a click does, and it is there before anything is selected
  await expect(textures.locator('.info')).toHaveText('Click to replace textures on selected faces.')

  // without a data directory the list is the placeholder of the generator, and a page of one tile
  const tile = textures.locator('.tile')

  await expect(tile).toHaveCount(1)
  await expect(tile.first()).toContainText('jorge-[stone].jpg')
  await expect(textures.locator('.range')).toHaveText('1 of 1')

  // and the tiles are idle while nothing is selected: there is no face to paint
  await expect(tile.first()).toBeDisabled()
  await expect(inspector.locator('.empty')).toBeVisible()

  // take the face under the crosshair: the lock click turns the camera, so the aim is written back first
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  await expect(tile.first()).toBeEnabled()

  // the texture of the face is the one of the level, and no source of the editor has the file: the group says it
  await expect(inspector.locator('.group .source')).toHaveText(['Missing'])

  // the pointer goes, so the click of the test lands on the tile and not on the canvas of the locked view
  await page.evaluate(() => {
    // the pointer is let go, so a click of the test reaches the tile and not the canvas of the locked view
    globalThis.document.exitPointerLock()
  })

  await tile.first().click()

  // the face draws with the placeholder now: the texture of the selection is a custom one, and there is one of it
  await expect(inspector.locator('.group .source')).toHaveText(['Custom'])
  await expect(inspector.locator('.textures .name')).toHaveText(['jorge-[stone].jpg'])
  await expect(inspector.locator('.textures .count')).toHaveText(['1'])

  // the step is one of the history: the undo puts the face back on its own texture. The selection stays (a texture does
  // not move the indices of the level), so the widget shows the face it was on.
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  await expect(inspector.locator('.group .source')).toHaveText(['Missing'])
  await expect(inspector.locator('.textures .count')).toHaveText(['1'])
})
