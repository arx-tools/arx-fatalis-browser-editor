import { expect, test, type Locator, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, nextFrames, screenshotDifference, seedLayout, waitForLevel } from './support/editor.ts'

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
 * The colours of the dots on the marker overlay of the top view.
 *
 * @remarks
 * The dots are circles, and the canvas antialiases their edge into a ring of shades: the test reads the pixels the dot
 * paints fully, which is the colour it is drawn with.
 *
 * @param page The page of the editor.
 *
 * @returns The colours of the solid pixels, as `r,g,b`, in order.
 */
async function dotColoursOf(page: Page): Promise<string[]> {
  return await page.locator('[data-widget-kind="top-view"] canvas.lights').evaluate((node) => {
    const canvas = node as HTMLCanvasElement
    const context = canvas.getContext('2d')

    if (context === null) {
      return []
    }

    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    const colours = new Set<string>()

    for (let index = 0; index < data.length; index = index + 4) {
      if ((data[index + 3] ?? 0) < 255) {
        continue
      }

      colours.add(`${String(data[index])},${String(data[index + 1])},${String(data[index + 2])}`)
    }

    return [...colours].toSorted()
  })
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
  const lit = await screenshotDifference(page, off, on)

  // the torch lights the floor and the walls around it: many pixels are brighter, not a few edges
  expect(lit.differing).toBeGreaterThan(1000)
  expect(lit.secondSum).toBeGreaterThan(lit.firstSum)

  await dynamic.click()
  await nextFrames(page, 3)

  const offAgain = await stageOf(page).screenshot()
  const back = await screenshotDifference(page, off, offAgain)

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
  const darker = await screenshotDifference(page, off, dark)

  // the baked light goes away: the level is dark, so the picture is much darker
  expect(darker.secondSum).toBeLessThan(darker.firstSum)

  await statics.click()
  await nextFrames(page, 3)

  const back = await stageOf(page).screenshot()
  const restored = await screenshotDifference(page, off, back)

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

test('the small views draw the yellow dots of the lights, and grey the ones a switch took out', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await openTorch(page, { flatZero: false })
  await page.waitForTimeout(800)

  // the markers of the views are off by default: L of the key help shows them
  await page.keyboard.press('l')

  const statics = page.locator('#static-lights')
  const dynamic = page.locator('#dynamic-lights')

  // the plan draws two colours and no more: the fixed yellow of a light that lights the level, and the grey of the
  // ones the switches took out (2026-11-19, the owner: the coloured shapes read as a smudge on a plan, and the dots are
  // a colour of their own)
  await expect
    .poll(async () => {
      return await dotColoursOf(page)
    })
    .toEqual(['140,140,140', '255,213,74'])

  // static off, dynamic off: every light of the level is out, so every dot is grey, and the level keeps its marks
  await statics.click()

  await expect
    .poll(async () => {
      return await dotColoursOf(page)
    })
    .toEqual(['140,140,140'])

  // the dynamic lights on, the static off: the semi-dynamic ones are lit again, the others stay grey
  await dynamic.click()

  await expect
    .poll(async () => {
      return await dotColoursOf(page)
    })
    .toEqual(['140,140,140', '255,213,74'])

  // both off: grey again
  await dynamic.click()

  await expect
    .poll(async () => {
      return await dotColoursOf(page)
    })
    .toEqual(['140,140,140'])

  // the switch of the markers takes the dots away: the overlay is clear
  await page.keyboard.press('l')

  await expect
    .poll(async () => {
      return await markerPixelsOf(page)
    })
    .toBe(0)
})

/**
 * The flicker of the layer stops while the tab is hidden, and comes back with it.
 *
 * @remarks
 * A browser tab in the background draws nothing the author can see, and the layer used to paint its torch frames all
 * along: a quarter of a core for hours on a tab nobody looked at (2026-11-18, the owner). The page says it is hidden
 * through its visibility, and the layer stops its chain of frames with it.
 *
 * The test counts the animation frames the page asks for, not the pixels: the flicker of a torch is a few shades on the
 * corners of a room, and whether that reaches a pixel of the canvas is up to the camera and the texture under it.
 */
test('the flicker stops while the tab is hidden, and comes back with it', async ({ page }) => {
  await page.addInitScript(() => {
    const raf = globalThis.requestAnimationFrame
    const counter = { value: 0 }

    Reflect.set(globalThis, '__rafCalls', counter)
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback): number => {
        counter.value = counter.value + 1

        return raf(callback)
      },
    })
  })

  await openTorch(page)

  // the Lighter preset leaves the layer off: the switch is what makes the torches burn
  await page.locator('#dynamic-lights').click()
  await page.waitForTimeout(600)

  async function rafCalls(): Promise<number> {
    return await page.evaluate(() => {
      const counter = Reflect.get(globalThis, '__rafCalls') as { value: number }

      return counter.value
    })
  }

  async function resetCount(): Promise<void> {
    await page.evaluate(() => {
      const counter = Reflect.get(globalThis, '__rafCalls') as { value: number }

      counter.value = 0
    })
  }

  // the layer is on: its ticker asks for frames all the time
  await resetCount()
  await page.waitForTimeout(300)

  expect(await rafCalls()).toBeGreaterThan(5)

  // the page says it is hidden, and the chain of the layer stops with it
  await page.evaluate(() => {
    const { document } = globalThis

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(200)

  await resetCount()
  await page.waitForTimeout(300)

  expect(await rafCalls()).toBe(0)

  // the tab comes back: the ticker comes back with it
  await page.evaluate(() => {
    const { document } = globalThis

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(200)

  await resetCount()
  await page.waitForTimeout(300)

  expect(await rafCalls()).toBeGreaterThan(5)
})
