import { expect, test, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The lock of a widget: a widget the user pinned keeps its size while the window changes, and the others take the
 * space it does not use.
 *
 * @remarks
 * The lock lives on the node of the widget (the size it keeps), and the pass works the whole dock out from it. The
 * stored layout carries it as a `fixed` size, so it survives a reload. The borders are the other half of this story:
 * see `layoutDrag.spec.ts` for what a drag does to a lock.
 */
test.setTimeout(120_000)

/**
 * The height of a widget on the dock.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns The height of its node, in pixels.
 */
async function heightOf(page: Page, kind: string): Promise<number> {
  return await page.locator(`.lm-DockPanel-widget[data-widget-kind="${kind}"]`).evaluate((node) => {
    return Math.round(node.getBoundingClientRect().height)
  })
}

/**
 * The size a widget shows in the badge of its plate.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns The text of the badge.
 */
async function badgeOf(page: Page, kind: string): Promise<string> {
  const badge = page.locator(`[data-widget-kind="${kind}"] .WidgetOverlay .size`)

  return (await badge.textContent()) ?? ''
}

test('a locked widget keeps its size, the others take the rest', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  // the edit mode is the lock of the header
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await expect(page.locator('[data-widget-kind="map-statistics"] button[aria-label="Unlock the widget"]')).toBeVisible()

  // the plan comes locked from the preset, the two elevations under it are free
  const locked = await heightOf(page, 'top-view')
  const frontBefore = await heightOf(page, 'front-view')

  // a taller window: the locked plan keeps its height, the free view under it grows
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.waitForTimeout(600)

  expect(await heightOf(page, 'top-view')).toBe(locked)
  expect(await heightOf(page, 'front-view')).toBeGreaterThan(frontBefore)
})

test('the lock is in the stored layout, so a reload keeps it', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()

  // the elevation under the plan is free, so the lock is the one the button takes
  await page.locator('[data-widget-kind="left-view"] button[aria-label="Lock the widget"]').click()
  await page.waitForTimeout(600)

  const locked = await heightOf(page, 'left-view')

  // the stored tree says the size is fixed
  const stored: string | null = await page.evaluate(() => {
    return localStorage.getItem('layout')
  })

  expect(stored).toContain(`"kind":"fixed","px":${String(locked)}`)

  await page.reload()
  await waitForLevel(page)

  // the widget came back locked, and at its own size
  await expect(page.locator('[data-widget-kind="left-view"]')).toHaveAttribute('data-locked-height', String(locked))
  expect(await heightOf(page, 'left-view')).toBe(locked)
})

test('a locked widget shows its size on the plate, and an unlocked one shows none', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()

  // the preset locks four widgets, and every one of them carries the size the owner measured
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(4)
  expect(await badgeOf(page, 'top-view')).toBe('350 × 350')
  expect(await badgeOf(page, 'jump-to-location')).toBe('200 × 50')
  expect(await badgeOf(page, 'map-statistics')).toBe('350 × 210')
  expect(await badgeOf(page, 'polygon-inspector')).toBe('350 × 190')

  // a widget the preset left free has no badge
  await expect(page.locator('[data-widget-kind="keyboard-shortcuts"] .WidgetOverlay .size')).toHaveCount(0)

  // the lock goes: the badge goes with it
  await page.locator('[data-widget-kind="map-statistics"] button[aria-label="Unlock the widget"]').click()
  await expect(page.locator('[data-widget-kind="map-statistics"] .WidgetOverlay .size')).toHaveCount(0)
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(3)

  // and the plate of a free widget puts a badge back on it
  await page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Lock the widget"]').click()

  const width = await page.locator('[data-widget-kind="keyboard-shortcuts"]').evaluate((node) => {
    return Math.round(node.getBoundingClientRect().width)
  })
  const height = await heightOf(page, 'keyboard-shortcuts')

  expect(await badgeOf(page, 'keyboard-shortcuts')).toBe(`${String(width)} × ${String(height)}`)
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(4)
})

test('a smaller window squeezes the widgets, it does not cut them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.waitForTimeout(500)

  async function dockHeight(): Promise<number> {
    return await page.locator('.lm-DockPanel').evaluate((node) => {
      return Math.round(node.getBoundingClientRect().height)
    })
  }

  async function columnHeight(): Promise<number> {
    // the three widgets of the left column, measured on the dock node so no selector can drift
    return await page.locator('.lm-DockPanel').evaluate((node) => {
      const kinds = new Set(['top-view', 'left-view', 'front-view'])
      let total = 0

      for (const widget of node.querySelectorAll('.lm-DockPanel-widget')) {
        if (kinds.has((widget as HTMLElement).dataset.widgetKind ?? '')) {
          total = total + widget.getBoundingClientRect().height
        }
      }

      return Math.round(total)
    })
  }

  const locked = await heightOf(page, 'top-view')

  await page.setViewportSize({ width: 1280, height: 600 })
  await page.waitForTimeout(700)

  // the dock follows the window (lumino writes the sum of the minimums on its node, which the plan has to keep small)
  expect(await dockHeight()).toBeLessThan(620)
  // the lock holds: the two views under the plan are the ones that give up their height
  expect(await heightOf(page, 'top-view')).toBe(locked)
  expect(await columnHeight()).toBeLessThanOrEqual(await dockHeight())

  // and when even the floors of the neighbours do not fit, the lock shrinks too instead of pushing the column out
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.waitForTimeout(700)

  expect(await heightOf(page, 'top-view')).toBeLessThan(locked)
  expect(await columnHeight()).toBeLessThanOrEqual(await dockHeight())
})
