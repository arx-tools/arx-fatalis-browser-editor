import { expect, test } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { litPixels, nextFrames, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The layer of the particles: the view draws the level while the layer is on.
 *
 * @remarks
 * The layer asks the view for a frame on every frame of the fire, and the view draws on demand: a request that canceled
 * the frame of the request before it starved every frame, and the view stayed blank until the loop of the pointer lock
 * drew again (2026-11-23, the owner: the view showed nothing until the first pointer lock, with the particles on).
 * The switch is seeded on before the load, so the first frame of the view is the one the layer starves.
 */
test('the view draws the level with the particles on', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  await page.addInitScript(() => {
    localStorage.setItem('particlesVisible', 'true')
  })
  // the blank level needs no data dir: the layer runs on any level, with the jorge pattern for the particles
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await nextFrames(page, 6)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const painted = await litPixels(view)

  expect(painted).toBeGreaterThan(0)
})
