import type { Buffer } from 'node:buffer'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, nextFrames, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The dotted reading of two screenshots: how many pixels differ, and how bright the two are together.
 *
 * @param page The page the screenshots were taken in: the browser decodes the images.
 * @param first The first screenshot.
 * @param second The second screenshot.
 *
 * @returns The count of the pixels that differ, the brightness of both and the largest difference.
 */
async function differenceOf(
  page: Page,
  first: Buffer,
  second: Buffer,
): Promise<{ differing: number; pixels: number; firstSum: number; secondSum: number; peak: number }> {
  return await page.evaluate(
    async ([one, other]) => {
      const view = globalThis
      async function imageOf(base64: string): Promise<ImageData> {
        const image = new view.Image()

        image.src = `data:image/png;base64,${base64}`
        await image.decode()

        const canvas = view.document.createElement('canvas')

        canvas.width = image.width
        canvas.height = image.height

        const context = canvas.getContext('2d')

        if (context === null) {
          throw new Error('the browser gave no canvas to decode the screenshot')
        }

        context.drawImage(image, 0, 0)

        return context.getImageData(0, 0, image.width, image.height)
      }

      const firstImage = await imageOf(one)
      const secondImage = await imageOf(other)
      let differing = 0
      let firstSum = 0
      let secondSum = 0
      let peak = 0

      for (let index = 0; index < firstImage.data.length; index = index + 4) {
        const firstColor = firstImage.data[index] + firstImage.data[index + 1] + firstImage.data[index + 2]
        const secondColor = secondImage.data[index] + secondImage.data[index + 1] + secondImage.data[index + 2]

        firstSum = firstSum + firstColor
        secondSum = secondSum + secondColor

        const difference = Math.abs(firstColor - secondColor)

        if (difference > 6) {
          differing = differing + 1
        }

        if (difference > peak) {
          peak = difference
        }
      }

      return { differing, pixels: firstImage.data.length / 4, firstSum, secondSum, peak }
    },
    [first.toString('base64'), second.toString('base64')],
  )
}

/**
 * Opens the Lighter preset and puts the camera on a burning torch.
 *
 * @param page The page of the editor.
 * @param options The light of the level.
 * @param options.flatZero Whether the flat light goes to zero: only the dynamic layer can light the level then.
 */
async function openTorch(page: Page, options: { flatZero?: boolean } = {}): Promise<void> {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await page.waitForTimeout(300)

  const torch = page.locator('[data-widget-kind="light-inspector"] .light', { hasText: 'Fire' }).first()

  await torch.locator('.jump').click()
  await nextFrames(page, 2)

  if (options.flatZero !== false) {
    // the flat light to zero: only the dynamic layer can light the level
    await page.locator('#flat-luminosity').evaluate((node) => {
      const slider = node as HTMLInputElement

      slider.value = '0'
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
}

/**
 * The canvas of the walkable view.
 *
 * @param page The page of the editor.
 *
 * @returns The locator of the canvas.
 */
function stageOf(page: Page): Locator {
  return page.locator('[data-widget-kind="3d-view"] canvas.stage')
}

/**
 * The number of lit pixels on the marker overlay of the top view.
 *
 * @param page The page of the editor.
 *
 * @returns The count of the pixels with an alpha.
 */
async function markerPixelsOf(page: Page): Promise<number> {
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

test('the dynamic light layer lights the level like the game, and goes off again', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await openTorch(page)
  await page.waitForTimeout(1200)

  const off = await stageOf(page).screenshot()
  const dynamic = page.locator('#dynamic-lights')

  await expect(dynamic).toHaveAttribute('aria-pressed', 'false')
  await dynamic.click()
  await nextFrames(page, 4)
  await page.waitForTimeout(400)

  const on = await stageOf(page).screenshot()
  const lit = await differenceOf(page, off, on)

  // the torch lights the floor and the walls around it: many pixels are brighter, not a few edges
  expect(lit.differing).toBeGreaterThan(1000)
  expect(lit.secondSum).toBeGreaterThan(lit.firstSum)

  await dynamic.click()
  await nextFrames(page, 3)

  const offAgain = await stageOf(page).screenshot()
  const back = await differenceOf(page, off, offAgain)

  // the baked colour comes back exactly: a still camera draws the same picture without the layer
  expect(back.differing).toBe(0)
})

test('the static light switch takes the baked light away, and puts it back', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await openTorch(page, { flatZero: false })
  await page.waitForTimeout(1200)

  const off = await stageOf(page).screenshot()
  const statics = page.locator('#static-lights')

  await expect(statics).toHaveAttribute('aria-pressed', 'true')
  await statics.click()
  await nextFrames(page, 3)

  const dark = await stageOf(page).screenshot()
  const darker = await differenceOf(page, off, dark)

  // the baked light goes away: the level is dark, so the picture is much darker
  expect(darker.secondSum).toBeLessThan(darker.firstSum)

  await statics.click()
  await nextFrames(page, 3)

  const back = await stageOf(page).screenshot()
  const restored = await differenceOf(page, off, back)

  expect(restored.differing).toBe(0)
})

test('the dynamic light switch stays in the browser', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()

  const dynamic = page.locator('#dynamic-lights')
  const statics = page.locator('#static-lights')

  await expect(dynamic).toHaveAttribute('aria-pressed', 'false')
  await expect(statics).toHaveAttribute('aria-pressed', 'true')

  await dynamic.click()
  await statics.click()

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return [localStorage.getItem('dynamicLightsVisible'), localStorage.getItem('staticLightsVisible')]
      })
    })
    .toEqual(['true', 'false'])

  await page.reload()
  await page.waitForTimeout(500)

  await expect(page.locator('#dynamic-lights')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#static-lights')).toHaveAttribute('aria-pressed', 'false')
})

test('the small views draw the marker shapes, and hide the lights of a switched off layer', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await openTorch(page, { flatZero: false })
  await page.waitForTimeout(800)

  // the markers of the views are off by default: L of the key help shows them
  await page.keyboard.press('l')

  const statics = page.locator('#static-lights')
  const dynamic = page.locator('#dynamic-lights')

  // static on, dynamic off: the static lights are drawn
  await expect
    .poll(async () => {
      return await markerPixelsOf(page)
    })
    .toBeGreaterThan(0)

  // static off: every light of the layer is disabled, so nothing is drawn
  await statics.click()

  await expect
    .poll(async () => {
      return await markerPixelsOf(page)
    })
    .toBe(0)

  // the dynamic lights on, the static off: only the semi-dynamic ones are drawn
  await dynamic.click()

  await expect
    .poll(async () => {
      return await markerPixelsOf(page)
    })
    .toBeGreaterThan(0)

  // both off: nothing
  await dynamic.click()

  await expect
    .poll(async () => {
      return await markerPixelsOf(page)
    })
    .toBe(0)
})
