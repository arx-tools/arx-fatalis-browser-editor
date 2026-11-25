import { expect, test, type Page } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { editorUrl, seedLayout, waitForLayoutSettled, waitForLevel } from './support/editor.ts'

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
type Box = {
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
  const rowCenter = { x: box.x + halfWidth, y: box.y + halfHeight }
  const targetHalf = target.width / 2
  const targetCenter = { x: target.left + targetHalf, y: target.top + target.height - 20 }

  await page.mouse.move(rowCenter.x, rowCenter.y)
  await page.mouse.down()
  await page.mouse.move(targetCenter.x, targetCenter.y, { steps: 12 })
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

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await waitForLayoutSettled(page)

  // the uv mapper is alone in its column, so it takes the whole height (and its lock follows, after the pass). The
  // texture list and the row of the history go, or the column keeps a split under the mapper and the drop below would
  // halve that split, not the column
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="textures"] button[aria-label="Remove the Texture Mapper widget"]').click()
  await page.locator('[data-widget-kind="undo-redo"] button[aria-label="Remove the Undo and Redo widget"]').click()
  await waitForLayoutSettled(page)

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

test('a widget alone in its line keeps one side, and a neighbor on the other axis gives it the second', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await waitForLayoutSettled(page)

  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')

  // the viewer locks the width of the keys, and only that: the height is the height of the dock, with no split to keep it
  await expect(keys).toHaveAttribute('data-locked-width', '350')
  await expect(keys).not.toHaveAttribute('data-locked-height', /.+/u)
  const view = await boxOf(page, '3d-view')
  const narrow = await boxOf(page, 'keyboard-shortcuts')

  expect(narrow.height).toBe(view.height)

  // a taller window: the keys grow with the dock, their width stays
  await page.setViewportSize({ width: 1631, height: 1000 })
  await waitForLayoutSettled(page)

  const tall = await boxOf(page, 'keyboard-shortcuts')

  expect(tall.width).toBe(350)
  expect(tall.height).toBeGreaterThan(narrow.height)

  // the plate says which side is kept
  await page.locator('header button[aria-label="Unlock the layout"]').click()

  expect(await badgeOf(page, 'keyboard-shortcuts')).toBe('350 × auto')

  // a widget under the keys gives them a neighbor on the other axis: the lock takes the second side, at the size the
  // drop made (2026-11-25, the owner)
  await dropWidget(page, 'map-statistics', tall)
  await page.waitForTimeout(900)

  const withSecond = await boxOf(page, 'keyboard-shortcuts')

  expect(await keys.getAttribute('data-locked-height')).toBe(String(withSecond.height))
  expect(await badgeOf(page, 'keyboard-shortcuts')).toBe(`350 × ${String(withSecond.height)}`)
})

test('a lock keeps the width of a widget alone in its column, and the height follows the dock', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto('/editor/')
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await page.waitForTimeout(900)

  // the column of the uv mapper collapses when the texture list and the row of the history go: its height has no split
  // to live in any more, and the lock goes back to the width alone
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="textures"] button[aria-label="Remove the Texture Mapper widget"]').click()
  await page.locator('[data-widget-kind="undo-redo"] button[aria-label="Remove the Undo and Redo widget"]').click()
  await page.waitForTimeout(900)

  const mapper = await boxOf(page, 'uv-mapper')
  const view = await boxOf(page, '3d-view')

  expect(mapper.width).toBe(350)
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-height')).toBeNull()
  expect(mapper.height).toBe(view.height)

  await page.reload()
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(4)
  await waitForLayoutSettled(page)

  // the lock came back with the side it keeps: the mapper stays 350 wide, and its height is the height of the dock
  const reloaded = await boxOf(page, 'uv-mapper')
  const reloadedView = await boxOf(page, '3d-view')

  expect(reloaded.width).toBe(350)
  expect(reloaded.height).toBe(reloadedView.height)
  expect(reloadedView.width).toBe(view.width)
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-width')).toBe('350')
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-height')).toBeNull()
})

test('a locked widget keeps its size, the others take the rest', async ({ page }) => {
  await seedLayout(page, testLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  // the edit mode is the lock of the header
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await expect(page.locator('[data-widget-kind="map-statistics"] button[aria-label="Unlock the widget"]')).toBeVisible()

  // the plan comes locked from the preset, the group inspector under it is free
  const locked = await heightOf(page, 'top-view')
  const frontBefore = await heightOf(page, 'group-inspector')

  // a taller window: the locked plan keeps its height, the free widget under it grows
  await page.setViewportSize({ width: 1280, height: 1100 })
  await waitForLayoutSettled(page)

  expect(await heightOf(page, 'top-view')).toBe(locked)
  expect(await heightOf(page, 'group-inspector')).toBeGreaterThan(frontBefore)
})

test('the lock is in the stored layout, so a reload keeps it', async ({ page }) => {
  await seedLayout(page, testLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()

  // the group inspector under the plan is free, so the lock is the one the button takes
  await page.locator('[data-widget-kind="group-inspector"] button[aria-label="Lock the widget"]').click()
  await waitForLayoutSettled(page)

  const locked = await heightOf(page, 'group-inspector')

  // the stored history of the preset says the size is fixed: the layout is written to the storage after a debounce, so
  // the wait is for the value and not for a moment after the click
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('layoutHistories') ?? ''
      })
    })
    .toContain(`"kind":"fixed","px":${String(locked)}`)

  await page.reload()

  // the layout comes back at once, and the lock with it: the level of the url waits for the folder of the game (the
  // notice of the walkable view), which the lock has nothing to do with
  await expect(page.locator('[data-widget-kind="group-inspector"]')).toBeVisible()

  // the widget came back locked, and at its own size
  await expect(page.locator('[data-widget-kind="group-inspector"]')).toHaveAttribute(
    'data-locked-height',
    String(locked),
  )
  expect(await heightOf(page, 'group-inspector')).toBe(locked)
})

test('a locked widget shows its size on the plate, and an unlocked one shows none', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()

  // the preset locks five widgets, and every one of them carries the size the owner measured
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(5)
  expect(await badgeOf(page, 'top-view')).toBe('360 × 260')
  expect(await badgeOf(page, 'jump-to-location')).toBe('200 × 50')
  expect(await badgeOf(page, 'map-statistics')).toBe('350 × 200')
  expect(await badgeOf(page, 'polygon-inspector')).toBe('350 × 180')
  expect(await badgeOf(page, 'undo-redo')).toBe('350 × 60')

  // a widget the preset left free has no badge
  await expect(page.locator('[data-widget-kind="selection-inspector"] .WidgetOverlay .size')).toHaveCount(0)

  // the lock goes: the badge goes with it
  await page.locator('[data-widget-kind="map-statistics"] button[aria-label="Unlock the widget"]').click()
  await expect(page.locator('[data-widget-kind="map-statistics"] .WidgetOverlay .size')).toHaveCount(0)
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(4)

  // and the plate of a free widget puts a badge back on it
  await page.locator('[data-widget-kind="selection-inspector"] button[aria-label="Lock the widget"]').click()

  const width = await page.locator('[data-widget-kind="selection-inspector"]').evaluate((node) => {
    return Math.round(node.getBoundingClientRect().width)
  })
  const height = await heightOf(page, 'selection-inspector')

  expect(await badgeOf(page, 'selection-inspector')).toBe(`${String(width)} × ${String(height)}`)
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(5)
})

test('a preset switched in the edit mode comes with the locks on the plates', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  // the editor preset has the statistics the wait for the level reads; the switch below is the point of the test
  await seedLayout(page, testLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()

  // the preset is chosen while the edit mode is on: its widgets are built now, and their plates are mounted before the
  // locks of the tree are written on them
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Rooms' }).click()

  await expect
    .poll(async () => {
      return await page.locator('[data-widget-kind="top-view"] .WidgetOverlay').count()
    })
    .toBe(1)

  // the three locks of the rooms preset are on the plates: the plan, the statistics and the steps
  await expect(page.locator('.WidgetOverlay .size')).toHaveCount(3)
  expect(await badgeOf(page, 'top-view')).toBe('350 × 260')
  expect(await badgeOf(page, 'map-statistics')).toBe('350 × 200')
  expect(await badgeOf(page, 'undo-redo')).toBe('350 × 60')
})

test('a smaller window squeezes the widgets, it does not cut them', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 })
  await seedLayout(page, testLayout)
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
    // the two widgets of the left column, measured on the dock node so no selector can drift
    return await page.locator('.lm-DockPanel').evaluate((node) => {
      const kinds = new Set(['top-view', 'group-inspector'])
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

  // and when even the floors of the neighbors do not fit, the lock shrinks too instead of pushing the column out: with
  // the 260 high plan the 400 high window still fits, so the window goes lower than the plan
  await page.setViewportSize({ width: 1280, height: 300 })
  await page.waitForTimeout(700)

  expect(await heightOf(page, 'top-view')).toBeLessThan(locked)
  expect(await columnHeight()).toBeLessThanOrEqual(await dockHeight())
})
