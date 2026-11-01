import { expect, test, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The lock of a widget: a widget the user pinned keeps its size while the window changes, and the others take the
 * space it does not use.
 *
 * @remarks
 * The lock is a `max-height` on the node of the widget, which lumino reads as the limit of its size. The stored layout
 * carries it as a `fixed` size, so it survives a reload.
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

test('a locked widget keeps its size, the others take the rest', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  // the edit mode is the lock of the header
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await expect(
    page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Lock the widget"]'),
  ).toBeVisible()

  const beforeLock = await heightOf(page, 'keyboard-shortcuts')

  await page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Lock the widget"]').click()
  await expect(
    page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Unlock the widget"]'),
  ).toBeVisible()

  const locked = await heightOf(page, 'keyboard-shortcuts')

  expect(locked).toBe(beforeLock)

  const statisticsBefore = await heightOf(page, 'map-statistics')

  // a taller window: the locked widget keeps its height, the one above it grows
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.waitForTimeout(600)

  expect(await heightOf(page, 'keyboard-shortcuts')).toBe(locked)
  expect(await heightOf(page, 'map-statistics')).toBeGreaterThan(statisticsBefore)
})

test('the lock is in the stored layout, so a reload keeps it', async ({ page }) => {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="map-statistics"] button[aria-label="Lock the widget"]').click()
  await page.waitForTimeout(600)

  const locked = await heightOf(page, 'map-statistics')

  // the stored tree says the size is fixed
  const stored: string | null = await page.evaluate(() => {
    return localStorage.getItem('layout')
  })

  expect(stored).toContain('"kind":"fixed"')

  await page.reload()
  await waitForLevel(page)

  // the widget came back locked, and at its own size
  await expect(page.locator('[data-widget-kind="map-statistics"]')).toHaveAttribute(
    'data-locked-height',
    String(locked),
  )
  expect(await heightOf(page, 'map-statistics')).toBe(locked)
})

test('a smaller window squeezes the widgets, it does not cut them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="keyboard-shortcuts"] button[aria-label="Lock the widget"]').click()
  await page.waitForTimeout(500)

  async function dockHeight(): Promise<number> {
    return await page.locator('.lm-DockPanel').evaluate((node) => {
      return Math.round(node.getBoundingClientRect().height)
    })
  }

  async function columnHeight(): Promise<number> {
    // the three widgets of the right column, measured on the dock node so no selector can drift
    return await page.locator('.lm-DockPanel').evaluate((node) => {
      const kinds = new Set(['map-statistics', 'polygon-inspector', 'keyboard-shortcuts'])
      let total = 0

      for (const widget of node.querySelectorAll('.lm-DockPanel-widget')) {
        if (kinds.has((widget as HTMLElement).dataset.widgetKind ?? '')) {
          total = total + widget.getBoundingClientRect().height
        }
      }

      return Math.round(total)
    })
  }

  const locked = await heightOf(page, 'keyboard-shortcuts')

  await page.setViewportSize({ width: 1280, height: 600 })
  await page.waitForTimeout(700)

  // the dock follows the window (lumino writes the sum of the minimums on its node, which the plan has to keep small)
  expect(await dockHeight()).toBeLessThan(620)
  // the lock holds: the two widgets above it are the ones that give up their height
  expect(await heightOf(page, 'keyboard-shortcuts')).toBe(locked)
  expect(await columnHeight()).toBeLessThanOrEqual(await dockHeight())

  // and when even the floors of the neighbours do not fit, the lock shrinks too instead of pushing the column out
  await page.setViewportSize({ width: 1280, height: 400 })
  await page.waitForTimeout(700)

  expect(await heightOf(page, 'keyboard-shortcuts')).toBeLessThan(locked)
  expect(await columnHeight()).toBeLessThanOrEqual(await dockHeight())
})
