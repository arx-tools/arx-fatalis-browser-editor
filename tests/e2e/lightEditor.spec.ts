import { expect, test, type Page } from '@playwright/test'
import { editorUrl, waitForLayoutSettled } from './support/editor.ts'

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
