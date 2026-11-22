import { expect, test, type Page } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { editorUrl, seedLayout, seedLightingProfile, statOf, waitForLevel } from './support/editor.ts'

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
  await seedLayout(page, testLayout)
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

/**
 * The dots of a fixed view follow the light switch on the blank level, without a data directory.
 *
 * @remarks
 * The level the editor opens is a plane with one light of its own (2026-11-20, the owner): a test of the markers does not
 * have to wait for the level of the game's files, and the dot is there the moment the level arrives. The switch is read
 * by the view on a frame it asks for: a frame it never draws would leave the dot on the canvas (the bug of the frozen
 * tabs), so the test is also the one that reads a switch of the fixed views.
 */
test('the dots of the blank level follow the switch of the lights', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  // the light of the blank level is static: the profile has to read the lights for its dot to be drawn
  await seedLightingProfile(page)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  // the level brings one light, and the markers start off like every overlay
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

/**
 * A dropped animation frame does not leave the dots of a fixed view on the picture of their last draw.
 *
 * @remarks
 * The browser owes a callback for every frame a view asks for, and a native dialog (the data dir picker) or a frozen tab
 * can lose one: the view would keep the state it drew last, and a switch would change the level and not the dots
 * (2026-11-19, the owner: level 0 from the picker kept its dots after the lights were switched off). The test drops the
 * callbacks of a window of time, and expects the view to ask again by itself.
 */
test('the dots of a fixed view come back after the frames a dialog dropped', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  await seedLightingProfile(page)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  await page.keyboard.press('l')

  await expect
    .poll(async () => {
      return await lightPixels(page)
    })
    .toBeGreaterThan(0)

  // the frames asked for in this window never come: the callback of each one is dropped
  await page.evaluate(() => {
    const raf = globalThis.requestAnimationFrame
    const dropper: { until: number } = { until: performance.now() + 1200 }

    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback): number => {
        if (performance.now() < dropper.until) {
          // the browser takes the frame and never runs it
          return raf(() => {
            return undefined
          })
        }

        return raf(callback)
      },
    })
  })

  // the switch asks for a frame while they are dropped
  await page.keyboard.press('l')

  // the watchdog of the view asks again after the window, and the dots follow the switch
  await expect
    .poll(
      async () => {
        return await lightPixels(page)
      },
      { timeout: 10_000 },
    )
    .toBe(0)
})

/**
 * The dots of a fixed view follow the switches after the level was loaded a second time.
 *
 * @remarks
 * `hideMap` runs on every change of the level, and it used to stop the watches of the widget with the map: the view kept
 * the picture of the level it drew first, and the lights, the rooms and the selection of the second level did not reach
 * it (2026-11-20, the owner: the data dir picker loads the level a second time, and the dots of the fixed views stayed
 * as they were). The test changes the level on the screen, and expects the lights to work on the level that follows.
 */
test('the dots of a fixed view follow the switches after a second level', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  await seedLightingProfile(page)
  await page.goto('/?map=blank-minimal')
  await waitForLevel(page)

  // the second level of the session: the plane with the light of its own
  await page.getByRole('combobox', { name: /The maps the editor can open/u }).selectOption('blank:flat')

  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(121)

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
