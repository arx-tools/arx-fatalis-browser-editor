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
 * The box of a widget on the dock, in whole pixels.
 */
interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * Reads the box of a widget on the dock.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns The box of its node.
 */
async function boxOf(page: Page, kind: string): Promise<Box> {
  return await page.locator(`.lm-DockPanel-widget[data-widget-kind="${kind}"]`).evaluate((node) => {
    const box = node.getBoundingClientRect()

    return {
      left: Math.round(box.left),
      top: Math.round(box.top),
      width: Math.round(box.width),
      height: Math.round(box.height),
    }
  })
}

/**
 * Adds a widget of a kind to the dock, by dragging its row of the picker onto the bottom of a widget.
 *
 * @param page The page to drag in.
 * @param kind The kind of the widget to add.
 * @param target The widget whose bottom edge the drop lands on: the new widget takes the lower half of it.
 * @param target.left The left edge of the widget, in window pixels.
 * @param target.top The top edge of the widget, in window pixels.
 * @param target.width The width of the widget, in pixels.
 * @param target.height The height of the widget, in pixels.
 */
async function dropWidget(page: Page, kind: string, target: Box): Promise<void> {
  if ((await page.locator('.WidgetPicker').count()) === 0) {
    await page.locator('button[aria-label="Add a widget"]').click()
  }

  const row = page.locator(`.WidgetPicker [data-picker-kind="${kind}"]`).first()
  const box = await row.boundingBox()

  if (box === null) {
    throw new Error(`the picker has no row for ${kind}`)
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const rowCentre = { x: box.x + halfWidth, y: box.y + halfHeight }
  const targetHalf = target.width / 2
  const targetCentre = { x: target.left + targetHalf, y: target.top + target.height - 20 }

  await page.mouse.move(rowCentre.x, rowCentre.y)
  await page.mouse.down()
  await page.mouse.move(targetCentre.x, targetCentre.y, { steps: 12 })
  await page.waitForTimeout(150)
  await page.mouse.up()
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

test('a widget dropped beside a locked one keeps the split the drop made', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  // the blank level: a drop is a layout question, the level is not part of it
  await page.goto('/editor/')
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(7)
  await page.waitForTimeout(900)

  // the uv mapper is alone in its column, so it takes the whole height (and its lock follows, after the pass). The
  // texture list and the row of the history go, or the column keeps a split under the mapper and the drop below would
  // halve that split, not the column
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="textures"] button[aria-label="Remove the Textures widget"]').click()
  await page.locator('[data-widget-kind="undo-redo"] button[aria-label="Remove the Undo and Redo widget"]').click()
  await page.waitForTimeout(800)

  const mapper = await boxOf(page, 'uv-mapper')

  // the texture list goes under the uv mapper: the two take a half of the column each
  await dropWidget(page, 'textures', mapper)

  const dropped = await boxOf(page, 'textures')
  const mapped = await boxOf(page, 'uv-mapper')

  expect(Math.abs(dropped.height - mapped.height)).toBeLessThanOrEqual(4)

  // the pass of the sizes runs a quarter of a second later: the split has to stay, not the size of the old lock
  await page.waitForTimeout(900)

  const settled = await boxOf(page, 'textures')
  const settledMapper = await boxOf(page, 'uv-mapper')

  expect(Math.abs(settled.height - settledMapper.height)).toBeLessThanOrEqual(4)

  // the lock followed the drag of the split, so a reload keeps what the user just made
  expect(
    Number(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-height')),
  ).toBeLessThanOrEqual(settledMapper.height)
})

test('a lock survives a reload when the widget is alone in its column', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto('/editor/')
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(7)
  await page.waitForTimeout(900)

  // the column of the uv mapper collapses when the texture list and the row of the history go: its height has no split
  // to live in any more
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="textures"] button[aria-label="Remove the Textures widget"]').click()
  await page.locator('[data-widget-kind="undo-redo"] button[aria-label="Remove the Undo and Redo widget"]').click()
  await page.waitForTimeout(800)

  const mapper = await boxOf(page, 'uv-mapper')
  const view = await boxOf(page, '3d-view')

  expect(mapper.width).toBe(400)
  expect(Number(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-height'))).toBe(
    mapper.height,
  )

  await page.reload()
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await page.waitForTimeout(1000)

  // the lock came back with the box: the mapper keeps its width, and it does not grow over the walkable view
  const reloaded = await boxOf(page, 'uv-mapper')
  const reloadedView = await boxOf(page, '3d-view')

  expect(reloaded.width).toBe(400)
  expect(reloaded.height).toBe(mapper.height)
  expect(reloadedView.width).toBe(view.width)
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-width')).toBe('400')
})

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

  // the stored history of the preset says the size is fixed
  const stored: string | null = await page.evaluate(() => {
    return localStorage.getItem('layoutHistories')
  })

  expect(stored).not.toBeNull()
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
