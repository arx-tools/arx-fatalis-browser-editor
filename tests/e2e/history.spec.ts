import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  clickCrosshair,
  editorUrl,
  layoutWithTheKeys,
  lockPointer,
  readPose,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The undo and the redo of the editor: the delete is a step of the history, the keys walk it, and the help shows
 * both.
 *
 * @remarks
 * The level comes over the network (see the note in the spec of the deletion), and the pointer lock is the reason
 * the selection is clicked through the page (see `clickCrosshair`). The layout is the editor preset: it has the walkable
 * view, the statistics and the help with the history buttons.
 */
test.setTimeout(120_000)

/**
 * The number of the faces the statistics shows.
 *
 * @param page The page whose statistics is read.
 *
 * @returns The count, or `undefined` while the level is on its way.
 */
async function facesOf(page: Page): Promise<number | undefined> {
  return await statOf(page, 'Total faces')
}

/**
 * The section of the help whose heading carries a word.
 *
 * @param page The page to read.
 * @param title A word of the heading, like `History`.
 *
 * @returns The section node.
 */
function sectionOf(page: Page, title: string): Locator {
  return page.locator('[data-widget-kind="keyboard-shortcuts"] section', { hasText: title }).first()
}

/**
 * The button the help puts next to a shortcut of the history: the aria label of the button is the word it carries,
 * so `Undo` finds the undo and `Redo` the redo.
 *
 * @param page The window whose help is queried.
 * @param word Which step the button runs, as the text of the button and of its aria label: `Undo` or `Redo`.
 *
 * @returns The button of that word, ready to be clicked.
 */
function historyButtonOf(page: Page, word: string): Locator {
  return page.locator(`[data-widget-kind="keyboard-shortcuts"] button[aria-label="${word}"]`)
}

/**
 * Opens the editor on the level, ready to be edited.
 *
 * @param page The page to prepare.
 */
async function openTheEditor(page: Page): Promise<void> {
  await seedLayout(page, layoutWithTheKeys())
  await page.goto(editorUrl())
  await waitForLevel(page)
}

test('a delete is a step of the history, and Ctrl+Z takes it back', async ({ page }) => {
  await openTheEditor(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)

  // no step yet: the help shows both buttons quiet
  await expect(historyButtonOf(page, 'Undo')).toBeDisabled()
  await expect(historyButtonOf(page, 'Redo')).toBeDisabled()

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  const afterDelete = await facesOf(page)

  // the step is on the stack: the undo can be pressed, the redo has nothing to make again
  await expect(historyButtonOf(page, 'Undo')).toBeEnabled()
  await expect(historyButtonOf(page, 'Redo')).toBeDisabled()

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await expect(historyButtonOf(page, 'Undo')).toBeDisabled()
  await expect(historyButtonOf(page, 'Redo')).toBeEnabled()

  // and the redo puts the faces out again, with the shortcut of the platform
  await page.keyboard.press('Control+y')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(afterDelete)
})

test('the redo follows the label on the key, not the position of a US keyboard', async ({ page }) => {
  await openTheEditor(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)
  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  // a Hungarian keyboard is QWERTZ: the key labelled Z sits where a US keyboard has Y, so the browser reports
  // `key: 'z'` with `code: 'KeyY'`. The editor has to follow the label, so this is the undo.
  await page.locator('[data-widget-kind="keyboard-shortcuts"]').evaluate((element) => {
    element.ownerDocument.defaultView?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', code: 'KeyY', ctrlKey: true, bubbles: true, cancelable: true }),
    )
  })

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)
})

test('the help runs the steps too, and a new delete drops the redo side', async ({ page }) => {
  await openTheEditor(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)
  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  const afterDelete = await facesOf(page)

  // the pointer lock keeps the widget clicks away (the browser sends them to the locked canvas), so the test
  // leaves the scene first. A synthesized `Escape` does not take the lock off in the headless chromium, so the
  // page leaves it the way the app does (the same call the `Escape` of the scene makes)
  await page.locator('[data-widget-kind="3d-view"]').evaluate((element) => {
    element.ownerDocument.exitPointerLock()
  })
  await page.waitForTimeout(400)

  expect(
    await page.locator('[data-widget-kind="3d-view"]').evaluate((element) => {
      return element.ownerDocument.pointerLockElement === null
    }),
  ).toBe(true)

  // the History section lists the two shortcuts with their buttons
  await expect(sectionOf(page, 'History').locator('kbd')).toHaveText(['Ctrl', 'Z', 'Ctrl', 'Y'])

  await historyButtonOf(page, 'Undo').click()

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await historyButtonOf(page, 'Redo').click()

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(afterDelete)

  // a delete after an undo is a new branch: the redo side is gone
  await historyButtonOf(page, 'Undo').click()

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)
  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  await expect(historyButtonOf(page, 'Redo')).toBeDisabled()
})

test('a step of the history survives a reload', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')

  // the blank level: it is there without a folder, and it is the same file on every load, so the stored steps may come
  // back on it (a level of the network has no value in the list to load again)
  await seedLayout(page, layoutWithTheKeys())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)
  const spawn = await readPose(page)

  await lockPointer(page, view)

  // the blank level is a floor under the player: the crosshair looks down to take a face of it
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  const afterDelete = await facesOf(page)

  // the level is loaded again, and its step comes back: the editor writes the steps down, and replays the stored ones
  // after the level is on the screen and painted
  await page.reload()
  await waitForLevel(page)

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(afterDelete)

  await expect(historyButtonOf(page, 'Undo')).toBeEnabled()

  // and the step is a real one, not a stale number: the undo takes the faces back
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)
})

test('the steps taken back are still the redo after a reload', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')

  // the blank level: it is there without a folder, and it is the same file on every load, so the stored steps may come
  // back on it (a level of the network has no value in the list to load again)
  await seedLayout(page, layoutWithTheKeys())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)
  const spawn = await readPose(page)

  await lockPointer(page, view)

  // the blank level is a floor under the player: the crosshair looks down to take a face of it
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  const afterDelete = await facesOf(page)

  // every step is taken back: the level is the one of its file again, and the step is the redo of the author
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await expect(historyButtonOf(page, 'Redo')).toBeEnabled()
  await expect(historyButtonOf(page, 'Undo')).toBeDisabled()

  // the reload keeps the line of the steps: the level is the file again, and the redo is still there
  await page.reload()
  await waitForLevel(page)

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await expect(historyButtonOf(page, 'Redo')).toBeEnabled()
  await expect(historyButtonOf(page, 'Undo')).toBeDisabled()

  // the redo makes the step again, and the undo takes it back: the restored redo is a real step
  await page.keyboard.press('Control+y')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(afterDelete)

  await expect(historyButtonOf(page, 'Undo')).toBeEnabled()

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)
})

test('the reset of the help takes every step back and keeps the redo', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')

  await openTheEditor(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const before = await facesOf(page)
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBeLessThan(before ?? 0)

  const afterDelete = await facesOf(page)
  const reset = page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Take every step back"]')

  // the reset is one click, and it goes while the pointer is free
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })

  await expect(reset).toBeEnabled()
  await reset.click()

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(before)

  await expect(historyButtonOf(page, 'Undo')).toBeDisabled()
  await expect(historyButtonOf(page, 'Redo')).toBeEnabled()

  // the steps are still there: the redo makes the step again
  await page.keyboard.press('Control+y')

  await expect
    .poll(async () => {
      return await facesOf(page)
    })
    .toBe(afterDelete)
})
