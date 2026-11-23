import { expect, test, type Page } from '@playwright/test'
import { roomsLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, lockPointer, seedLayout, waitForLayoutSettled, waitForLevel } from './support/editor.ts'

/**
 * The factory presets carry the sizes the owner measured.
 *
 * @remarks
 * The lock of a widget is a box, and a preset spells it on two levels of the tree: the width on the horizontal split
 * the widget sits in and the height on the vertical one. These tests are the acceptance of the numbers (2026-11-01):
 * the viewer comes with the keys on the left at 350 wide and the whole height, the plan at 350 x 403, the jump at
 * 350 x 70 and the render performance readout at 350 wide (2026-11-15, the owner rearranged the viewer: the keys were on
 * the right before), the editor with the plan at 350 x 300, the group inspector under it, the jump at 200 x 50, the
 * statistics at 350 x 200, the
 * inspector at 350 x 180 and the undo and redo row at 350 x 60
 * (2026-11-09), and the painter (2026-11-04) with the polygon inspector at 350 x 185 and the uv mapper at 350 x 430
 * (both columns are 350 wide, 2026-11-22, the owner);
 * the keys left the painter (2026-11-16), and the selection inspector takes their place. The rooms preset came with the round (2026-11-13): the statistics at 350 x 200 and the
 * top view at 350 x 260 (the room mapper went with its content into the room inspector, 2026-11-15); the statistics
 * are 350 wide too. The widgets the owner did not
 * size stay free, and the header has to keep the name of the preset after the locks are applied — a layout that comes
 * back differently from the preset would show up as `Blank` — the name now says which layout is active, and a tweak
 * belongs to the preset it was made on (see `layoutHistory.ts`).
 */
test.setTimeout(120_000)

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

test('the default layout is the viewer, with the keys on the left and the plan of the owner on the right', async ({
  page,
}) => {
  // the right column is 403 + 70 plus the numbers, and a lock is a **maximum**: a window shorter than that squeezes
  // the whole column, so the test of the sizes uses one that holds them (2026-11-15, the keys moved to the left)
  await page.setViewportSize({ width: 1631, height: 1200 })
  await page.goto(editorUrl())

  // the shell builds the dock before the level is downloaded, which is all this test needs
  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await expect(page.locator('[data-widget-kind="top-view"]')).toBeVisible()
  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Viewer')
  await waitForLayoutSettled(page)

  const keys = await boxOf(page, 'keyboard-shortcuts')
  const view = await boxOf(page, '3d-view')
  const plan = await boxOf(page, 'top-view')
  const jump = await boxOf(page, 'jump-to-location')
  const numbers = await boxOf(page, 'render-performance')

  // the keys are the left column, the walkable view the middle and the plan the right one
  expect(keys.width).toBe(350)
  expect(keys.left + keys.width + 4).toBe(view.left)
  expect(view.left + view.width + 4).toBe(plan.left)
  expect(view.width).toBeGreaterThan(340)

  // the keys take the whole height of the dock, like the view: the owner asked for the full height (2026-11-15).
  // Their width is a fixed size of the layout, not a lock box: a box needs both sides, and the height follows the dock
  expect(keys.top).toBe(view.top)
  expect(keys.height).toBe(view.height)
  expect(await page.locator('[data-widget-kind="keyboard-shortcuts"]').getAttribute('data-locked-width')).toBeNull()
  expect(await page.locator('[data-widget-kind="keyboard-shortcuts"]').getAttribute('data-locked-height')).toBeNull()

  expect(plan.width).toBe(350)
  expect(plan.height).toBe(403)
  expect(jump.width).toBe(350)
  expect(jump.height).toBe(70)
  expect(numbers.width).toBe(350)
  expect(await page.locator('[data-widget-kind="top-view"]').getAttribute('data-locked-width')).toBe('350')
  expect(await page.locator('[data-widget-kind="top-view"]').getAttribute('data-locked-height')).toBe('403')
  expect(await page.locator('[data-widget-kind="jump-to-location"]').getAttribute('data-locked-width')).toBe('350')
  expect(await page.locator('[data-widget-kind="jump-to-location"]').getAttribute('data-locked-height')).toBe('70')

  // the numbers are the one block of the column that follows the window
  expect(await page.locator('[data-widget-kind="render-performance"]').getAttribute('data-locked-height')).toBeNull()
  expect(numbers.height).toBeGreaterThan(210)

  // the three follow each other
  expect(jump.top).toBe(plan.top + plan.height + 4)
  expect(numbers.top).toBe(jump.top + jump.height + 4)
})

test('the editor preset comes with the sizes the owner measured', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Editor' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(7)
  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Editor')
  await waitForLayoutSettled(page)

  const plan = await boxOf(page, 'top-view')
  const left = await boxOf(page, 'left-view')
  const front = await boxOf(page, 'front-view')
  const view = await boxOf(page, '3d-view')
  const undo = await boxOf(page, 'undo-redo')
  const settings = await boxOf(page, 'edit-settings')
  const groups = await boxOf(page, 'group-inspector')

  // the left column: the plan is locked to 350 x 300, the two elevations share the rest under it
  expect(plan.width).toBe(350)
  expect(plan.height).toBe(300)
  expect(left.width).toBe(350)
  expect(left.top).toBe(plan.top + plan.height + 4)
  expect(left.height).toBeGreaterThan(100)
  expect(front.width).toBe(350)
  expect(front.top).toBe(left.top + left.height + 4)
  expect(front.height).toBeGreaterThan(100)

  // the middle is the walkable view alone, the whole height of the dock: no camera form and no jump
  expect(view.top).toBe(plan.top)
  expect(view.width).toBeGreaterThan(400)
  expect(view.height).toBeGreaterThan(700)
  await expect(page.locator('[data-widget-kind="camera-controls"]')).toHaveCount(0)
  await expect(page.locator('[data-widget-kind="jump-to-location"]')).toHaveCount(0)

  // the right column: the undo row to 50, the settings to 120, and the groups take what the locks leave
  expect(undo.width).toBe(350)
  expect(undo.height).toBe(50)
  expect(settings.width).toBe(350)
  expect(settings.height).toBe(170)
  expect(settings.top).toBe(undo.top + undo.height + 4)
  expect(groups.top).toBe(settings.top + settings.height + 4)
  expect(groups.width).toBe(350)
  expect(groups.height).toBeGreaterThan(400)
  expect(await page.locator('[data-widget-kind="undo-redo"]').getAttribute('data-locked-height')).toBe('50')
  expect(await page.locator('[data-widget-kind="edit-settings"]').getAttribute('data-locked-height')).toBe('170')
  expect(await page.locator('[data-widget-kind="group-inspector"]').getAttribute('data-locked-height')).toBeNull()

  // a taller window: the locks hold, and the widgets that are free take the room
  await page.setViewportSize({ width: 1631, height: 1100 })
  await waitForLayoutSettled(page)

  const planAfter = await boxOf(page, 'top-view')
  const leftAfter = await boxOf(page, 'left-view')
  const viewAfter = await boxOf(page, '3d-view')
  const undoAfter = await boxOf(page, 'undo-redo')
  const settingsAfter = await boxOf(page, 'edit-settings')
  const groupsAfter = await boxOf(page, 'group-inspector')

  expect(await presetName(page)).toBe('Editor')
  expect(planAfter.height).toBe(300)
  expect(undoAfter.height).toBe(50)
  expect(settingsAfter.height).toBe(170)
  expect(leftAfter.height).toBeGreaterThan(left.height)
  expect(viewAfter.height).toBeGreaterThan(view.height)
  expect(groupsAfter.height).toBeGreaterThan(groups.height)
})

test('the rooms preset comes with the sizes the owner measured', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(String(error))
  })

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Rooms' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Rooms')
  await waitForLayoutSettled(page)

  const statistics = await boxOf(page, 'map-statistics')
  const selection = await boxOf(page, 'selection-inspector')
  const top = await boxOf(page, 'top-view')
  const undo = await boxOf(page, 'undo-redo')
  const inspector = await boxOf(page, 'room-inspector')
  const view = await boxOf(page, '3d-view')

  expect(statistics.width).toBe(350)
  expect(statistics.height).toBe(200)
  expect(top.width).toBe(350)
  expect(top.height).toBe(260)
  expect(undo.width).toBe(350)
  expect(undo.height).toBe(60)

  expect(await page.locator('[data-widget-kind="map-statistics"]').getAttribute('data-locked-height')).toBe('200')
  expect(await page.locator('[data-widget-kind="top-view"]').getAttribute('data-locked-height')).toBe('260')
  expect(await page.locator('[data-widget-kind="undo-redo"]').getAttribute('data-locked-height')).toBe('60')
  expect(await page.locator('[data-widget-kind="room-inspector"]').getAttribute('data-locked-height')).toBeNull()

  // the two columns: the statistics and the selection on the left, the view, the top view, the steps and the rooms on
  // the right
  expect(selection.left).toBe(statistics.left)
  expect(selection.width).toBe(statistics.width)
  expect(selection.top).toBe(statistics.top + statistics.height + 4)
  expect(inspector.left).toBe(top.left)
  expect(undo.top).toBe(top.top + top.height + 4)
  expect(inspector.top).toBe(undo.top + undo.height + 4)
  expect(view.left).toBe(statistics.left + statistics.width + 4)
  expect(view.width).toBeGreaterThan(350)

  expect(errors).toEqual([])
})

test('the painter preset comes with the sizes the owner measured', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Painter')
  await waitForLayoutSettled(page)

  const inspector = await boxOf(page, 'polygon-inspector')
  const mapper = await boxOf(page, 'uv-mapper')
  const undo = await boxOf(page, 'undo-redo')

  // the two boxes of the arrangement: the two inspectors on the left, the uv mapper on the right
  expect(inspector.width).toBe(350)
  expect(inspector.height).toBe(185)
  expect(mapper.width).toBe(350)
  expect(mapper.height).toBe(430)

  expect(await page.locator('[data-widget-kind="polygon-inspector"]').getAttribute('data-locked-height')).toBe('185')
  expect(await page.locator('[data-widget-kind="uv-mapper"]').getAttribute('data-locked-width')).toBe('350')

  // the row of the undo and the redo: a locked 60 pixel strip under the uv mapper (2026-11-06, the owner's request)
  expect(undo.width).toBe(350)
  expect(undo.height).toBe(60)
  expect(await page.locator('[data-widget-kind="undo-redo"]').getAttribute('data-locked-height')).toBe('60')

  // the selection inspector and the texture list are free: they take what the two locked neighbours leave
  expect(await page.locator('[data-widget-kind="selection-inspector"]').getAttribute('data-locked-height')).toBeNull()
  expect(await page.locator('[data-widget-kind="textures"]').getAttribute('data-locked-height')).toBeNull()

  const selection = await boxOf(page, 'selection-inspector')
  const textures = await boxOf(page, 'textures')

  expect(selection.top).toBe(inspector.top + inspector.height + 4)
  expect(selection.left).toBe(inspector.left)
  expect(selection.width).toBe(inspector.width)
  // the selection inspector takes the height the keys had (2026-11-16): the left column has no third row any more
  expect(selection.height).toBeGreaterThan(520)
  expect(undo.top).toBe(mapper.top + mapper.height + 4)
  expect(textures.top).toBe(undo.top + undo.height + 4)

  // the walkable view is the middle column alone: no camera form, and it takes the room the columns leave
  const view = await boxOf(page, '3d-view')

  expect(view.width).toBeGreaterThan(400)
  expect(view.top).toBe(inspector.top)
})

test('every layout keeps its own history, and the steps of the menu take it back', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await waitForLayoutSettled(page)

  const menu = page.locator('header button[aria-label="Presets"]')
  const viewerRow = page.locator('.preset-row', { hasText: 'Viewer' })
  const editorRow = page.locator('.preset-row', { hasText: 'Editor' })
  // the viewer has no free info widget: the keys take the left column and the right one is locked, so the walkable view
  // is the one that a step of the layout can move (2026-11-15)
  const keys = page.locator('[data-widget-kind="3d-view"]')
  // the editor has no keys: its free widget for the step below is the group inspector
  const groups = page.locator('[data-widget-kind="group-inspector"]')

  /**
   * Opens the menu of the presets, when it is closed.
   */
  async function openMenu(): Promise<void> {
    // a reload of the level of the url asks for the folder of the game (the notice covers the whole editor), and the dock
    // is what this test is about: the notice answers with a blank map
    const prompt = page.locator('.MissingMapPrompt')

    if ((await prompt.count()) > 0) {
      await prompt.locator('.notice-dismiss').click()
    }

    if ((await page.locator('.preset-menu').count()) === 0) {
      await menu.click()
    }
  }

  // the viewer comes from the preset: the walkable view is free, and the menu has no step to take
  await expect(keys).not.toHaveAttribute('data-locked-height', /.+/u)
  await openMenu()
  await expect(viewerRow.locator('.step').first()).toBeDisabled()
  await menu.click()

  // a layout change: the view is locked in the edit mode (a lock is a step, like a drop)
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await keys.locator('button[aria-label="Lock the widget"]').click()

  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // the step is on the viewer, and only on the viewer
  await openMenu()
  await expect(viewerRow.locator('.step').first()).toBeEnabled()
  await expect(editorRow.locator('.step').first()).toBeDisabled()

  // the undo takes the lock away, the redo puts it back (the menu stays open through a step)
  await viewerRow.locator('.step').first().click()
  await expect(keys).not.toHaveAttribute('data-locked-height', /.+/u)

  await viewerRow.locator('.step').last().click()
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // switching away and back keeps the history of the viewer
  await editorRow.locator('.choose').click()

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Editor')

  // a step on the editor too, so both rows have one
  await groups.locator('button[aria-label="Lock the widget"]').click()

  await expect(groups).toHaveAttribute('data-locked-height', /.+/u)

  await menu.click()
  await viewerRow.locator('.choose').click()

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // the row of the editor is not the active one, and the menu still shows that it has a step: taking it switches over
  await openMenu()
  await expect(editorRow.locator('.step').first()).toBeEnabled()
  await editorRow.locator('.step').first().click()

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Editor')
  await expect(groups).not.toHaveAttribute('data-locked-height', /.+/u)

  // the viewer is the one with the lock now, and the dock is back on it for the reload
  await openMenu()
  await viewerRow.locator('.choose').click()

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(keys).toHaveAttribute('data-locked-height', /.+/u)

  // and the history is in the browser, so a reload brings the layout back as it was left
  await page.reload()

  await expect(page.locator('header button[aria-label="Presets"] .name')).toHaveText('Viewer')
  await expect(page.locator('[data-widget-kind="3d-view"]')).toHaveAttribute('data-locked-height', /.+/u)

  await openMenu()
  await expect(page.locator('.preset-row', { hasText: 'Viewer' }).locator('.step').first()).toBeEnabled()
})

/**
 * The six factory presets are on the function keys, in the order of the Presets menu.
 *
 * @remarks
 * The list is a list, not a sorted one: F1 is the viewer of the menu's first row, and so on to the lighter (2026-11-22,
 * the owner). The blank layout has no key of its own. The browser would open its own F1 (the help), F3 (the find) and F5
 * (the reload) on those keys, and the editor stops it: a page that reloaded would lose the preset the test just read.
 */
test('the function keys switch the six presets in the order of the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  const presets = [
    ['F1', 'Viewer'],
    ['F2', 'Editor'],
    ['F3', 'Painter'],
    ['F4', 'Rooms'],
    ['F5', 'Lighter'],
    ['F6', 'Entities'],
  ] as const

  for (const [key, name] of presets) {
    await page.keyboard.press(key)

    await expect
      .poll(async () => {
        return await presetName(page)
      })
      .toBe(name)

    // the closed button counts the layouts with the same key the menu row shows, so the active one reads at a glance
    await expect(page.locator('header button[aria-label="Presets"]')).toContainText(`(${key})`)
  }

  // the blank layout has no key of its own: a key without a preset leaves the layout where it is (the sixth preset)
  await page.keyboard.press('F7')

  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Entities')

  // the rows of the menu say the keys of the same list, and the blank layout says none
  await page.locator('header button[aria-label="Presets"]').click()

  const rows = page.locator('.preset-menu .preset-row')

  for (const [key, name] of presets) {
    await expect(rows.filter({ hasText: name })).toContainText(`(${key})`)
  }

  await expect(rows.filter({ hasText: 'Blank' })).not.toContainText('(')
})

/**
 * A preset switch rearranges the dock; the walkable view is in every preset, so the switch has to keep it.
 *
 * @remarks
 * The canvas of the view is the probe: a rebuilt widget brings a new canvas, and the tag put on the old one is gone.
 * The pointer lock is the owner's symptom of the rebuild: a switch under a locked pointer used to drop it.
 */
test('a preset switch keeps the walkable view and the pointer lock', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')

  await page.setViewportSize({ width: 1631, height: 850 })
  // the rooms preset is the one with the statistics the level is waited for: the switch goes to the viewer
  await seedLayout(page, roomsLayout)
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"]')
  const canvas = view.locator('canvas').first()

  await expect(canvas).toBeVisible()
  await waitForLevel(page)

  await canvas.evaluate((node) => {
    node.dataset.keep = 'yes'
  })

  await lockPointer(page, canvas)
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement !== null
      })
    })
    .toBe(true)

  await page.keyboard.press('F1')

  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Viewer')

  await waitForLayoutSettled(page)

  // the same canvas with the tag, and the pointer is still in the view: the widget was rearranged, not rebuilt
  await expect(canvas).toHaveAttribute('data-keep', 'yes')
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement !== null
      })
    })
    .toBe(true)
})

/**
 * The preset that is on the dock is not built again.
 *
 * @remarks
 * The tab bar of the dock is the probe: a rebuild of the layout (`restoreLayout`) throws the old bars away and makes
 * new ones, even when the widgets themselves are kept, so the tag on the old bar is gone. Pressing the key of the active
 * preset has to leave the dock alone (TODO 281).
 */
test('the active preset is not built again', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"]')
  const canvas = view.locator('canvas').first()

  await expect(canvas).toBeVisible()

  const tabBar = page.locator('.lm-TabBar').first()

  await expect(tabBar).toBeAttached()
  await tabBar.evaluate((node) => {
    node.dataset.keep = 'yes'
  })

  // F1 is the Viewer, the layout of the start: pressing it again is not a change
  await page.keyboard.press('F1')

  await expect
    .poll(async () => {
      return await presetName(page)
    })
    .toBe('Viewer')

  await waitForLayoutSettled(page)

  // the same bar of the dock: the shell did not restore the layout for the preset it is already on
  await expect(tabBar).toHaveAttribute('data-keep', 'yes')
})

/**
 * The Entities preset: the list is the left column, the right one keeps the plan, the history and the selection.
 *
 * @remarks
 * The owner rearranged the copy of the rooms layout for the entity work (2026-11-22): the entity list takes the whole
 * left column (in place of the statistics and the selection inspector), and the right column keeps the plan and the
 * history, with the selection inspector in the place the list had.
 */
test('the entities preset puts the list on the left, and the selection inspector on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Entities' }).click()
  await waitForLayoutSettled(page)

  const list = await boxOf(page, 'entity-list')
  const view = await boxOf(page, '3d-view')
  const plan = await boxOf(page, 'top-view')
  const undo = await boxOf(page, 'undo-redo')
  const selection = await boxOf(page, 'selection-inspector')

  // the list is the left column, the whole height, and the numbers of the level are not on this layout
  expect(list.left).toBe(0)
  expect(list.width).toBe(350)
  expect(list.top).toBe(view.top)
  expect(list.height).toBeGreaterThan(600)
  expect(await page.locator('[data-widget-kind="map-statistics"]').count()).toBe(0)

  // the right column: the plan, the history, and the selection inspector under them
  expect(plan.width).toBe(350)
  expect(plan.height).toBe(260)
  expect(undo.width).toBe(350)
  expect(undo.height).toBe(60)
  expect(selection.width).toBe(350)
  expect(selection.top).toBe(undo.top + undo.height + 4)
  expect(await presetName(page)).toBe('Entities')
})
