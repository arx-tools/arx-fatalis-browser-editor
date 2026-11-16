import { expect, test } from '@playwright/test'
import { editorUrl, waitForLayoutSettled } from './support/editor.ts'

/**
 * The lighting controls: the `Lighter` preset carries them, and the profile of the bake is a fact of the browser.
 *
 * @remarks
 * The profile is written into the local storage by the store of the lighting, and a reload has to find it again: the
 * author picks one and the next map starts with the same light. The bake itself is the generator's (the widget is the
 * door), so the test reads the storage and the select, not the palette.
 */
test('the Lighter preset brings the lighting controls, and the profile stays in the browser', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await expect(controls).toBeVisible()

  const select = controls.locator('select')

  await expect(select).toHaveValue('Flat')

  await select.selectOption('Realistic')

  // the store writes the profile into the storage: the value is the JSON of the string
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('lightingProfile')
      })
    })
    .toBe('"Realistic"')

  await page.reload()
  await waitForLayoutSettled(page)

  await expect(page.locator('[data-widget-kind="lighting-controls"]')).toBeVisible()
  await expect(page.locator('[data-widget-kind="lighting-controls"] select')).toHaveValue('Realistic')
})

/**
 * The picker lists the categories side by side.
 *
 * @remarks
 * The list of the kinds grew longer than a squeezed window is tall, so the three categories (rendering, controls, info)
 * are the three columns of the popup, each one a list of its own.
 */
test('the picker lists the widgets in three columns', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('button[aria-label="Add a widget"]').click()

  const positions = await page.locator('.WidgetPicker .group').evaluateAll((groups) => {
    return groups.map((group) => {
      return Math.round(group.getBoundingClientRect().x)
    })
  })

  expect(positions.length).toBe(3)
  expect(positions[0]).toBeLessThan(positions[1] ?? 0)
  expect(positions[1]).toBeLessThan(positions[2] ?? 0)
})

/**
 * The flat profile: the slider under the dropdown, and the value it keeps.
 *
 * @remarks
 * The slider is only there for the flat light (0 is dark, 1 is the brightest, in steps of 0.1), and its value is a fact
 * of the browser like the profile: the next visit starts with the same grey.
 */
test('the flat profile brings a luminosity slider, and the value stays', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await controls.locator('select').selectOption('Flat')

  const slider = controls.locator('input[type="range"]')

  await expect(slider).toBeVisible()
  await expect(slider).toHaveValue('0.7')

  await slider.evaluate((element) => {
    if (element instanceof HTMLInputElement) {
      element.value = '0.3'
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('flatLuminosity')
      })
    })
    .toBe('0.3')

  await page.reload()
  await waitForLayoutSettled(page)

  await expect(page.locator('[data-widget-kind="lighting-controls"] select')).toHaveValue('Flat')
  await expect(page.locator('[data-widget-kind="lighting-controls"] input[type="range"]')).toHaveValue('0.3')
})
