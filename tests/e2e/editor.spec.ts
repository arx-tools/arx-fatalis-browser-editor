import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

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

  await page.goto(editorUrl())

  // the header is the sign that the shell mounted at all
  await expect(page.getByText('Arx Fatalis Browser Editor')).toBeVisible()

  // the default layout is the viewer: the walkable view, the plan and the jump beside it, the numbers of the renderer
  // and the keys under them
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)

  for (const kind of ['3d-view', 'top-view', 'jump-to-location', 'render-performance', 'keyboard-shortcuts']) {
    await expect(page.locator(`.lm-DockPanel-widget[data-widget-kind="${kind}"]`)).toBeVisible()
  }

  expect(consoleErrors).toEqual([])
})

/**
 * The brand of the header gives its room to the middle of the bar on a narrow window.
 *
 * @remarks
 * The version, the mark of the source and the tip jar sit in the brand, and the middle of the bar (the level, the folder,
 * the export) needs the room first: below 1510 the brand keeps the title and the version alone, and the dots between the
 * gone parts go with them, so no separator is left hanging (2026-11-14, the owner). The divider between the tools of the
 * widgets and the presets is on at every width.
 */
test('the header keeps the title and the version on a narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 1450, height: 850 })
  await page.goto(editorUrl())

  const brand = page.locator('header .brand')

  await expect(brand.locator('.version')).toBeVisible()
  await expect(brand.locator('.version')).toContainText('v')
  await expect(brand.locator('.build')).toBeHidden()
  await expect(brand.locator('.source')).toBeHidden()
  await expect(brand.locator('.support')).toBeHidden()
  // the two dots of the brand: after the version, and after the mark of the source
  await expect(brand.locator('.dot')).toHaveCount(2)
  await expect(brand.locator('.dot').first()).toBeHidden()

  // the middle of the bar is what the brand gave the room to, and the divider of the right side is there
  await expect(page.locator('header .levels')).toBeVisible()
  await expect(page.locator('header .WidgetManager .dot')).toBeVisible()

  await page.setViewportSize({ width: 1631, height: 850 })

  await expect(brand.locator('.build')).toBeVisible()
  await expect(brand.locator('.source')).toBeVisible()
  await expect(brand.locator('.support')).toBeVisible()
  await expect(brand.locator('.dot').first()).toBeVisible()
})
