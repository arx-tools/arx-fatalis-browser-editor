import { expect, test, type Locator, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import {
  clickCrosshair,
  editorUrl,
  lockPointer,
  readPose,
  seedLayout,
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
  await seedLayout(page, editorLayout)
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
      return await statOf(page, 'Selected faces')
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
