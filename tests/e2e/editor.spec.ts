import { expect, test } from '@playwright/test'

/**
 * The smoke test of the shell: the editor opens in a real browser, the dock is built and the browser
 * reports no error while it happens.
 *
 * @remarks
 * It is the first test of the suite, the frame the others hang on: the level is not waited for, so the
 * test does not depend on the download of the level files. Every further scenario (the layout editor,
 * the picker, the camera form, the widgets) comes after it, one file per area of the editor.
 */
test('the shell opens with the default layout', async ({ page }) => {
  const consoleErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error))
  })

  await page.goto('/')

  // the header is the sign that the shell mounted at all
  await expect(page.getByText('Arx Fatalis Browser Editor')).toBeVisible()

  // the default layout: the walkable view, the statistics and the shortkeys
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(3)
  await expect(page.locator('.lm-DockPanel-widget[data-widget-kind="3d-view"]')).toBeVisible()
  await expect(page.locator('.lm-DockPanel-widget[data-widget-kind="map-statistics"]')).toBeVisible()
  await expect(page.locator('.lm-DockPanel-widget[data-widget-kind="controls"]')).toBeVisible()

  expect(consoleErrors).toEqual([])
})
