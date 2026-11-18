import { expect, test, type Page } from '@playwright/test'
import { editorUrl, nextFrames, screenshotDifference, waitForLayoutSettled } from './support/editor.ts'

/**
 * Opens the Lighter preset, where the Light Editor and the Light Inspector sit under the controls.
 *
 * @param page The page of the test.
 */
async function openLighter(page: Page): Promise<void> {
  await page.goto(editorUrl())
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)
}

/**
 * Picks the first light of the list.
 *
 * @param page The page of the test.
 */
async function pickFirstLight(page: Page): Promise<void> {
  await page.locator('[data-widget-kind="light-inspector"] .light').first().click()
}

test('the Light Editor writes the intensity of a light, and the undo takes it back', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')
  const intensity = editor.locator('input[aria-label="Intensity"]')

  await expect(intensity).not.toHaveValue('')

  const before = await intensity.inputValue()

  await intensity.fill('2.5')
  await intensity.press('Tab')

  await expect(page.getByRole('button', { name: /Undo/ })).toBeEnabled()

  await page.getByRole('button', { name: /Undo/ }).click()

  await expect(intensity).toHaveValue(before)
})

test('a selection of different lights is refused with its reasons', async ({ page }) => {
  await openLighter(page)

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await inspector.locator('.light').nth(0).click()
  await inspector
    .locator('.light')
    .nth(1)
    .click({ modifiers: ['Shift'] })

  const editor = page.locator('[data-widget-kind="light-editor"]')

  await expect(editor).toContainText("Can't edit lights on selection:")
  await expect(editor.locator('input[aria-label="Intensity"]')).toHaveCount(0)
})

test('the colour picker changes the colour of the light', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')
  const hex = editor.locator('.hex').first()

  await expect(hex).toHaveText(/^#[0-9A-F]{6}$/)

  const before = await hex.innerText()

  await editor.locator('input[aria-label="Hue"]').first().fill('200')

  await expect(hex).not.toHaveText(before)
  await expect(page.getByRole('button', { name: /Undo/ })).toBeEnabled()
})

/**
 * The palette of the level follows a light edit without leaving the field.
 *
 * @remarks
 * The light editor writes the light on the frame of every input, and the palette of the `Arx` profile has to follow it:
 * the surface of the level around the light changes colour on the picture, not after the field is left. The undo bakes
 * the same corners back, so the picture of the level before the edit comes back exactly.
 */
test('the Light Editor bakes the palette live, and the undo takes it back', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  await page.goto(editorUrl())
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  // the palette is what the Arx profile draws, and only the static lights are in it
  const controls = page.locator('[data-widget-kind="lighting-controls"] select')

  await expect(controls).toBeVisible({ timeout: 60_000 })
  await controls.selectOption('Arx')

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await expect(inspector.locator('.light').first()).toBeVisible({ timeout: 60_000 })
  await inspector.locator('select.shape-filter').selectOption('star')

  const row = inspector.locator('.light').first()

  // the jump puts the light in the middle of the walkable view, so its surface is on the picture
  await row.locator('.jump').click()
  await nextFrames(page, 3)
  await page.waitForTimeout(500)

  const stage = page.locator('[data-widget-kind="3d-view"] canvas.stage')
  const before = await stage.screenshot()
  const intensity = page.locator('[data-widget-kind="light-editor"] input[aria-label="Intensity"]')

  await expect(intensity).not.toHaveValue('')

  await intensity.fill('20')
  await intensity.press('Tab')
  await nextFrames(page, 3)

  const brighter = await stage.screenshot()
  const lit = await screenshotDifference(page, before, brighter)

  // the light is much brighter: the surface around it is lighter, not a few of its edges
  expect(lit.differing).toBeGreaterThan(100)
  expect(lit.secondSum).toBeGreaterThan(lit.firstSum)

  await page.getByRole('button', { name: /Undo/ }).click()
  await nextFrames(page, 3)

  const undone = await stage.screenshot()
  const back = await screenshotDifference(page, before, undone)

  // the palette is the same as before the edit: a still camera draws the same picture
  expect(back.differing).toBe(0)
})
