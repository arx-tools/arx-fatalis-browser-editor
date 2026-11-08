import { expect, test, type Page } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The `Blank` preset: a dock without a single widget, and the invitation in the middle of it.
 *
 * @remarks
 * The owner's request (2026-11-06): the last row of the preset menu is an **empty** layout, so a layout is built from
 * nothing — every widget of it is dragged in from the picker. An empty dock shows the invitation *„Drag and drop widgets
 * from the widget list ⚙ to form your own layout!"*, with the gear of the header in the middle of the sentence, locked
 * and unlocked alike; the first widget dropped on it is the first step of the history of that layout, and the step back
 * empties the dock again.
 */
test.setTimeout(120_000)

/**
 * The invitation an empty dock shows.
 *
 * @remarks
 * The gear is an icon, so it has no text: the sentences of the invitation read as one line around it.
 */
const INVITATION = 'Drag and drop widgets from the widget list to form your own layout!'

/**
 * Takes the editor to the `Blank` preset.
 *
 * @param page The page to move.
 */
async function chooseBlank(page: Page): Promise<void> {
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Blank' }).click()
}

/**
 * Opens the preset menu, when it is closed.
 *
 * @param page The page to open it on.
 */
async function openMenu(page: Page): Promise<void> {
  if ((await page.locator('.preset-menu').count()) === 0) {
    await page.locator('header button[aria-label="Presets"]').click()
  }
}

/**
 * Drags a widget of the picker into the middle of the dock.
 *
 * @param page The page to drag in.
 * @param kind The kind of the widget to add.
 * @param x The horizontal position the drop lands on, in window pixels.
 * @param y The vertical position the drop lands on, in window pixels.
 */
async function dropOnDock(page: Page, kind: string, x: number, y: number): Promise<void> {
  if ((await page.locator('.WidgetPicker').count()) === 0) {
    await page.locator('button[aria-label="Add a widget"]').click()
  }

  const row = page.locator(`.WidgetPicker [data-picker-kind="${kind}"]`).first()
  const box = await row.boundingBox()

  if (box === null) {
    throw new Error(`the picker has no row for ${kind}`)
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await page.mouse.move(box.x + halfWidth, box.y + halfHeight)
  await page.mouse.down()
  await page.mouse.move(x, y, { steps: 12 })
  await page.waitForTimeout(150)
  await page.mouse.up()

  // the pass of the sizes waits a quarter of a second after the last change of the layout
  await page.waitForTimeout(700)
}

test('the custom preset empties the dock and shows the invitation in the middle', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await expect(page.locator('.empty-hint')).toHaveCount(0)

  await chooseBlank(page)

  // no widget at all, the invitation in the middle of the whole dock, and the header keeps the name of the layout
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(0)
  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Blank')

  const hint = page.locator('.empty-hint')
  const dock = await page.locator('.Dock').boundingBox()

  await expect(hint).toHaveText(INVITATION)

  // the gear of the invitation is the gear of the header: the sentence points at the button that opens the picker
  const hintGear = await hint.locator('svg').evaluate((svg) => {
    return svg.getHTML()
  })
  const headerGear = await page
    .locator('header button[aria-label="Add a widget"] svg')
    .first()
    .evaluate((svg) => {
      return svg.getHTML()
    })

  expect(hintGear).toBe(headerGear)

  if (dock === null) {
    throw new Error('the dock has no box')
  }

  // the invitation is printed in the middle of the whole dock: the box of the text is read with a range, because the
  // element itself fills the dock (the text is what the grid centres)
  const text = await hint.evaluate((node) => {
    const range = document.createRange()

    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()

    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })

  const textHalfWidth = text.width / 2
  const textHalfHeight = text.height / 2
  const dockHalfWidth = dock.width / 2
  const dockHalfHeight = dock.height / 2

  expect(text.x + textHalfWidth).toBeCloseTo(dock.x + dockHalfWidth, 0)
  expect(text.y + textHalfHeight).toBeCloseTo(dock.y + dockHalfHeight, 0)

  // and it is one line: the gear sits inside the sentence, not on a row of its own (a bare text run next to an element
  // would be a grid item of the hint, and the sentence would break into three rows)
  expect(text.height).toBeLessThan(30)

  // a layout nothing was dragged into has no step yet, and the row of the custom one is the selected row
  await openMenu(page)

  const blankRow = page.locator('.preset-row', { hasText: 'Blank' })

  await expect(blankRow.locator('.step').first()).toBeDisabled()
  await expect(blankRow).toHaveClass(/is-selected/u)

  await page.locator('header button[aria-label="Presets"]').click()

  // the invitation is not tied to the mode: the edit mode leaves it in place, and so does closing the lock again
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await expect(hint).toBeVisible()
  await page.locator('header button[aria-label="Lock the layout"]').click()
  await expect(hint).toBeVisible()

  // and it is the empty layout the editor starts from, so a reload comes back to it
  await page.reload()
  await page.waitForTimeout(900)

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(0)
  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Blank')
  await expect(page.locator('.empty-hint')).toHaveText(INVITATION)
})

test('a widget dropped on the empty dock is the first step, and the step back empties it again', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await chooseBlank(page)
  await expect(page.locator('.empty-hint')).toBeVisible()

  const dock = await page.locator('.Dock').boundingBox()

  if (dock === null) {
    throw new Error('the dock has no box')
  }

  const dockHalfWidth = dock.width / 2
  const dockHalfHeight = dock.height / 2

  await dropOnDock(page, '3d-view', dock.x + dockHalfWidth, dock.y + dockHalfHeight)

  // the widget took the whole dock: there was nothing to split it with
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(1)
  await expect(page.locator('[data-widget-kind="3d-view"]')).toBeVisible()
  await expect(page.locator('.empty-hint')).toHaveCount(0)

  const view = await page.locator('[data-widget-kind="3d-view"]').boundingBox()

  if (view === null) {
    throw new Error('the dropped widget has no box')
  }

  expect(view.width).toBeGreaterThan(dock.width * 0.9)
  expect(view.height).toBeGreaterThan(dock.height * 0.9)

  // the drop is a step of the custom layout, and it is the first one
  await openMenu(page)

  const blankRow = page.locator('.preset-row', { hasText: 'Blank' })

  await expect(blankRow.locator('.step').first()).toBeEnabled()

  await blankRow.locator('.step').first().click()
  await page.waitForTimeout(700)

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(0)
  await expect(page.locator('.empty-hint')).toHaveText(INVITATION)

  // the redo puts the widget back, so the step is a real state of the layout
  await openMenu(page)
  await page.locator('.preset-row', { hasText: 'Blank' }).locator('.step').last().click()
  await page.waitForTimeout(700)

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(1)
  await expect(page.locator('.empty-hint')).toHaveCount(0)
})
