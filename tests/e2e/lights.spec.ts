import { expect, test, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The markers of the lights in a fixed view: the overlay canvas is a 2D canvas over the scene, and the markers are its
 * only painting, so a pixel with an alpha belongs to one.
 *
 * @param page The page of the editor.
 *
 * @returns The number of lit pixels on the overlay of the top view.
 */
async function lightPixels(page: Page): Promise<number> {
  return await page.locator('[data-widget-kind="top-view"] canvas.lights').evaluate((node) => {
    const canvas = node as HTMLCanvasElement
    const context = canvas.getContext('2d')

    if (context === null) {
      return 0
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let lit = 0

    for (let index = 0; index < data.length; index = index + 4) {
      if (data[index + 3] > 0) {
        lit = lit + 1
      }
    }

    return lit
  })
}

test('the fixed views draw a marker of every light while the switch is on', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  // the markers start off, like the other overlays
  await expect
    .poll(async () => {
      return await lightPixels(page)
    })
    .toBe(0)

  await page.keyboard.press('l')

  await expect
    .poll(async () => {
      return await lightPixels(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('l')

  await expect
    .poll(async () => {
      return await lightPixels(page)
    })
    .toBe(0)
})
