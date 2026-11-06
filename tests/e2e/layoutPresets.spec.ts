import { expect, test, type Page } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The factory presets carry the sizes the owner measured.
 *
 * @remarks
 * The lock of a widget is a box, and a preset spells it on two levels of the tree: the width on the horizontal split
 * the widget sits in and the height on the vertical one. These tests are the acceptance of the numbers (2026-11-01):
 * the viewer comes with the plan at 350 x 285 and the jump at 350 x 80, the editor with the plan at 350 x 350, the
 * jump at 200 x 50, the statistics at 350 x 210 and the inspector at 350 x 190, and the painter (2026-11-04) with the
 * polygon inspector at 360 x 185, the keys at 360 x 430 and the uv mapper at 400 x 430. The widgets the owner did not
 * size stay free, and the header has to keep the name of the preset after the locks are applied — a layout that comes
 * back differently from the preset would show up as `Custom` — the name now says which layout is active, and a tweak
 * belongs to the preset it was made on (see `layoutHistory.ts`).
 */
test.setTimeout(120_000)

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
 * Reads the box of a widget.
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
 * Reads the name of the preset the header shows.
 *
 * @param page The page to read.
 *
 * @returns The label of the preset button.
 */
async function presetName(page: Page): Promise<string> {
  return (await page.locator('header button[aria-label="Presets"] .name').textContent()) ?? ''
}

test('the default layout is the viewer, with the plan and the jump of the owner locked', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  // the shell builds the dock before the level is downloaded, which is all this test needs
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(4)
  await expect(page.locator('[data-widget-kind="top-view"]')).toBeVisible()
  await page.waitForTimeout(600)

  expect(await presetName(page)).toBe('Viewer')

  const plan = await boxOf(page, 'top-view')
  const jump = await boxOf(page, 'jump-to-location')

  expect(plan.width).toBe(350)
  expect(plan.height).toBe(285)
  expect(jump.width).toBe(350)
  expect(jump.height).toBe(80)
  expect(await page.locator('[data-widget-kind="top-view"]').getAttribute('data-locked-width')).toBe('350')
  expect(await page.locator('[data-widget-kind="jump-to-location"]').getAttribute('data-locked-height')).toBe('80')

  // the two follow each other, and the walkable view takes what the locked column does not
  expect(jump.top).toBe(plan.top + plan.height + 4)

  const view = await boxOf(page, '3d-view')

  expect(view.width).toBeGreaterThan(350)
  expect(view.left + view.width + 4).toBe(plan.left)

  // the keys are free: they keep what the two locked widgets leave
  const keys = await boxOf(page, 'keyboard-shortcuts')

  expect(await page.locator('[data-widget-kind="keyboard-shortcuts"]').getAttribute('data-locked-height')).toBeNull()
  expect(keys.top).toBe(jump.top + jump.height + 4)
})

test('the editor preset comes with the four sizes the owner measured', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Editor' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(9)
  await page.waitForTimeout(800)

  expect(await presetName(page)).toBe('Editor')

  const plan = await boxOf(page, 'top-view')
  const jump = await boxOf(page, 'jump-to-location')
  const statistics = await boxOf(page, 'map-statistics')
  const inspector = await boxOf(page, 'polygon-inspector')

  expect(plan.width).toBe(350)
  expect(plan.height).toBe(350)
  expect(jump.width).toBe(200)
  expect(jump.height).toBe(50)
  expect(statistics.width).toBe(350)
  expect(statistics.height).toBe(210)
  expect(inspector.width).toBe(350)
  expect(inspector.height).toBe(190)

  // the camera form and the keys are free, and they fill what the locks leave
  const camera = await boxOf(page, 'camera-controls')

  expect(camera.top).toBe(jump.top)
  expect(camera.width).toBeGreaterThan(80)

  const keys = await boxOf(page, 'keyboard-shortcuts')

  expect(keys.height).toBeGreaterThan(190)
  expect(keys.top).toBe(inspector.top + inspector.height + 4)

  // a taller window: the locks hold, the free widgets take the room, and the header keeps the name of the preset
  await page.setViewportSize({ width: 1631, height: 1100 })
  await page.waitForTimeout(800)

  const planAfter = await boxOf(page, 'top-view')
  const statisticsAfter = await boxOf(page, 'map-statistics')
  const keysAfter = await boxOf(page, 'keyboard-shortcuts')

  expect(await presetName(page)).toBe('Editor')
  expect(planAfter.height).toBe(350)
  expect(statisticsAfter.height).toBe(210)
  expect(keysAfter.height).toBeGreaterThan(keys.height)
})

test('the painter preset comes with the sizes the owner measured', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await page.waitForTimeout(800)

  expect(await presetName(page)).toBe('Painter')

  const inspector = await boxOf(page, 'polygon-inspector')
  const keys = await boxOf(page, 'keyboard-shortcuts')
  const mapper = await boxOf(page, 'uv-mapper')

  // the three boxes of the arrangement: the two inspectors and the keys on the left, the uv mapper on the right
  expect(inspector.width).toBe(360)
  expect(inspector.height).toBe(185)
  expect(keys.width).toBe(360)
  expect(keys.height).toBe(430)
  expect(mapper.width).toBe(400)
  expect(mapper.height).toBe(430)

  expect(await page.locator('[data-widget-kind="polygon-inspector"]').getAttribute('data-locked-height')).toBe('185')
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-width')).toBe('400')

  // the selection inspector and the texture list are free: they take what the two locked neighbours leave
  expect(await page.locator('[data-widget-kind="selection-inspector"]').getAttribute('data-locked-height')).toBeNull()
  expect(await page.locator('[data-widget-kind="textures"]').getAttribute('data-locked-height')).toBeNull()

  const selection = await boxOf(page, 'selection-inspector')
  const textures = await boxOf(page, 'textures')

  expect(selection.top).toBe(inspector.top + inspector.height + 4)
  expect(keys.top).toBe(selection.top + selection.height + 4)
  expect(textures.top).toBe(mapper.top + mapper.height + 4)

  // the walkable view is the middle column alone: no camera form, and it takes the room the columns leave
  const view = await boxOf(page, '3d-view')

  expect(view.width).toBeGreaterThan(400)
  expect(view.top).toBe(inspector.top)
})

test('every layout keeps its own history, and the steps of the menu take it back', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(4)
  await page.waitForTimeout(800)

  const menu = page.locator('header button[aria-label="Presets"]')
  const viewerRow = page.locator('.preset-row', { hasText: 'Viewer' })
  const editorRow = page.locator('.preset-row', { hasText: 'Editor' })
  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')

  /**
   * Opens the menu of the presets, when it is closed.
   */
  async function openMenu(): Promise<void> {
    if ((await page.locator('.preset-menu').count()) === 0) {
      await menu.click()
    }
  }

  // the viewer comes from the preset: the keys are free, and the menu has no step to take
  await expect(keys).not.toHaveAttribute('data-locked-height', /.+/u)
  await openMenu()
  await expect(viewerRow.locator('.step').first()).toBeDisabled()
  await menu.click()

  // a layout change: the keys are locked in the edit mode (a lock is a step, like a drop)
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await keys.locator('button[aria-label="Lock the widget"]').click()
  await page.waitForTimeout(900)

  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // the step is on the viewer, and only on the viewer
  await openMenu()
  await expect(viewerRow.locator('.step').first()).toBeEnabled()
  await expect(editorRow.locator('.step').first()).toBeDisabled()

  // the undo takes the lock away, the redo puts it back (the menu stays open through a step)
  await viewerRow.locator('.step').first().click()
  await page.waitForTimeout(700)
  await expect(keys).not.toHaveAttribute('data-locked-height', /.+/u)

  await viewerRow.locator('.step').last().click()
  await page.waitForTimeout(700)
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // switching away and back keeps the history of the viewer
  await editorRow.locator('.choose').click()
  await page.waitForTimeout(700)

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Editor')

  // a step on the editor too, so both rows have one
  await keys.locator('button[aria-label="Lock the widget"]').click()
  await page.waitForTimeout(900)

  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  await menu.click()
  await viewerRow.locator('.choose').click()
  await page.waitForTimeout(700)

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // the row of the editor is not the active one, and the menu still shows that it has a step: taking it switches over
  await openMenu()
  await expect(editorRow.locator('.step').first()).toBeEnabled()
  await editorRow.locator('.step').first().click()
  await page.waitForTimeout(700)

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Editor')
  await expect(page.locator('[data-widget-kind="keyboard-shortcuts"]')).not.toHaveAttribute('data-locked-height', /.+/u)

  // the viewer is the one with the lock now, and the dock is back on it for the reload
  await openMenu()
  await viewerRow.locator('.choose').click()
  await page.waitForTimeout(700)

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // and the history is in the browser, so a reload brings the layout back as it was left
  await page.reload()
  await page.waitForTimeout(900)

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(page.locator('[data-widget-kind="keyboard-shortcuts"]')).toHaveAttribute('data-locked-height', /.+/u)

  await openMenu()
  await expect(page.locator('.preset-row', { hasText: 'Viewer' }).locator('.step').first()).toBeEnabled()
})
