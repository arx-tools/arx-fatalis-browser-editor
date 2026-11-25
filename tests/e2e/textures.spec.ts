import { expect, test } from '@playwright/test'
import type { LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
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

  // the inspector says it through the count of the selection (2026-11-24: the empty message went from the widget)
  await expect(inspector.locator('.AccordionRow', { hasText: 'Face Indices' }).locator('.value')).toHaveText('0')

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

/**
 * The dock of the test of the list: the walkable view and a tall texture list.
 *
 * @remarks
 * Every tile of a page has to be on the screen for a drag over a name: the list of the `Painter` preset is 180 px high,
 * which is a part of a row, and a tile that is not drawn can not be selected.
 */
const LIST_LAYOUT: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [
    { kind: 'auto', ratio: 1 },
    { kind: 'fixed', px: 420 },
  ],
  children: [
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    { type: 'widget', kind: WIDGET_KINDS.textures },
  ],
}

/**
 * The list turns to its next page, and the name under a tile is a caption, not a text to select.
 *
 * @remarks
 * The list is filled through the drop zone, which is the way a texture that no source of the editor has comes in: a page
 * holds a hundred tiles, and two hundred and fifty files are enough for a **second** page to be as tall as the first
 * (a shorter one would scroll to its top by itself, and the test would pass without the widget doing anything). The name
 * of a tile is cut with an ellipsis, so it is not a file name to copy: the text of a tile is not a selection of its own
 * (2026-11-25, the owner).
 */
test('a new page starts at the top of the list, and the name of a tile is a caption', async ({ page }) => {
  await seedLayout(page, LIST_LAYOUT)
  await page.goto('/?map=blank-flat')

  const textures = page.locator('[data-widget-kind="textures"]')

  await expect(textures).toBeVisible()

  // the texture of a generator that is one pixel: the files of the drop have to be images, and their bytes are not read
  // for anything but a thumbnail
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  await textures.locator('.TextureBrowserWidget').evaluate((element, base64) => {
    const view = element.ownerDocument.defaultView

    if (view === null) {
      return
    }

    const transfer = new view.DataTransfer()

    for (let index = 0; index < 250; index = index + 1) {
      const bytes = view.Uint8Array.from(view.atob(base64), (character) => {
        return character.codePointAt(0) ?? 0
      })

      transfer.items.add(new view.File([bytes], `a${String(index)}.png`, { type: 'image/png' }))
    }

    element.dispatchEvent(new view.DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
  }, png)

  const list = textures.locator('.list')

  // the placeholder of the generator and the two hundred and fifty files: three pages
  await expect(textures.locator('.range')).toHaveText('1-100 of 251')
  await expect(list.locator('.tile')).toHaveCount(100)

  // the next page is as tall as this one, so a scroll position would stay on it without the widget resetting it
  const heightOfTheList = await list.evaluate((element) => {
    return { client: element.clientHeight, scroll: element.scrollHeight }
  })

  expect(heightOfTheList.scroll).toBeGreaterThan(heightOfTheList.client)

  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })

  await expect
    .poll(async () => {
      return await list.evaluate((element) => {
        return element.scrollTop
      })
    })
    .toBeGreaterThan(0)

  await textures.getByRole('button', { name: 'Next page' }).click()

  await expect(textures.locator('.range')).toHaveText('101-200 of 251')
  await expect
    .poll(async () => {
      return await list.evaluate((element) => {
        return element.scrollTop
      })
    })
    .toBe(0)

  // the first name of the second page: a caption, and the drag of the pointer does not select it
  const name = list.locator('.tile .name').first()

  await expect(name).toHaveText('a99.png')

  const userSelect = await name.evaluate((element) => {
    return getComputedStyle(element).userSelect
  })

  expect(userSelect).toBe('none')
})

/**
 * The texture of the selected faces finds its tile: the rows of the Selection Inspector pick it, and the list shows it.
 *
 * @remarks
 * The owner asked for the same reveal the lights and the entities have (2026-11-25): a texture picked in the Selection
 * Inspector turns the Texture Browser to its page, clears the filter that hides it, and highlights the tile. The level is
 * the blank one: its floor is painted with the placeholder texture of the generator, which is the one the browser
 * carries, so the face of the pick lists a texture the list can show (the level of the game names its own, and the
 * placeholder level is the one where the two meet). The faces come from a shift click on the room map of the top view, so
 * the test needs no pointer lock.
 */
test('a texture picked in the selection inspector is on the screen of the texture list', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, painterLayout())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  const textures = page.locator('[data-widget-kind="textures"]')
  const inspector = page.locator('[data-widget-kind="selection-inspector"]')
  const tile = textures.locator('.tile')

  await expect(tile).toHaveCount(1)

  // the rooms show on the plan, and a shift click on the room of the spawn selects its faces: the floor of the level
  await page.keyboard.press('r')

  const marker = page.locator('[data-widget-kind="top-view"] .camera-mark')
  const box = await marker.boundingBox()

  if (box === null) {
    throw new Error('the top view has no marker')
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const middle = { x: box.x + halfWidth, y: box.y + halfHeight }

  await page.keyboard.down('Shift')
  await page.mouse.click(middle.x, middle.y)
  await page.keyboard.up('Shift')

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  const row = inspector.locator('.textures li', { hasText: 'jorge-[stone].jpg' })

  await expect(row).toHaveCount(1)

  // the search hides the texture: the list has no tile of it
  const search = textures.getByRole('searchbox', { name: 'Search textures' })

  await search.fill('no-such-texture')
  await expect(tile).toHaveCount(0)

  // the click on the row of the inspector picks the texture: the list clears the filter and highlights the tile
  await row.click()

  await expect(search).toHaveValue('')
  await expect(tile).toHaveCount(1)
  await expect(tile).toHaveClass(/is-selected/)
  await expect(row).toHaveClass(/is-selected/)
  await expect(tile).toBeVisible()
})
