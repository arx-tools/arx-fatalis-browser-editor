import { expect, test, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { editorUrl, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * A border of the dock and what it does to a locked widget.
 *
 * @remarks
 * The lock is a box: the drag of a border is stronger than the lock, but only on the axis the border moves. The owner
 * agreed on three cases (2026-11-01).
 *
 * A **container** border (a column of the dock) resizes the box of the split a locked widget sits in, but not the
 * widget: the lock does not move, and the free widget next to it takes the difference — during the drag, so nothing
 * jumps when the pointer goes up.
 *
 * The **own** border of a locked widget (the border of the split it is in) resizes it, and the new size becomes the
 * lock.
 *
 * A **cross** border (the border of the split above, which sets the height of the row) resizes the other axis of the
 * widget, and that new size becomes the lock.
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
 * Reads the lock of a widget.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns The size the widget is locked to, or `undefined` when it is not locked.
 */
async function lockOf(page: Page, kind: string): Promise<{ width: number; height: number } | undefined> {
  return await page.locator(`.lm-DockPanel-widget[data-widget-kind="${kind}"]`).evaluate((node) => {
    const width = Number(node.dataset.lockedWidth)
    const height = Number(node.dataset.lockedHeight)

    if (Number.isNaN(width) || Number.isNaN(height)) {
      return undefined
    }

    return { width, height }
  })
}

/**
 * Opens the editor on the `Editor` preset and unlocks the layout.
 *
 * @remarks
 * The jump comes **locked from the preset** (200 x 50, the size the owner measured on the plate), so there is no lock
 * button to press: the drags below are measured against a widget the preset pinned.
 *
 * @param page The page to prepare.
 *
 * @returns The box of the jump, which is what a drag is measured against.
 */
async function openWithALockedJump(page: Page): Promise<Box> {
  await seedLayout(page, editorLayout)
  await page.goto(editorUrl())
  await waitForLevel(page)

  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.waitForTimeout(600)

  const locked = await lockOf(page, 'jump-to-location')

  if (locked === undefined) {
    throw new Error('the jump of the Editor preset is not locked')
  }

  return await boxOf(page, 'jump-to-location')
}

/**
 * Where a border of the dock is, and where the drag takes it.
 */
interface Pull {
  /**
   * The horizontal position of the border.
   */
  readonly x: number
  /**
   * The vertical position of the border.
   */
  readonly y: number
  /**
   * How far the border is moved.
   */
  readonly dx: number
  /**
   * How far the border is moved.
   */
  readonly dy: number
  /**
   * Called while the button is still down, so the state of the drag can be read.
   */
  readonly during?: () => Promise<void>
}

/**
 * Drags a border of the dock with the real mouse of playwright.
 *
 * @param page The page to drag in.
 * @param pull Where the border is and where it goes.
 */
async function dragBorder(page: Page, pull: Pull): Promise<void> {
  await page.mouse.move(pull.x, pull.y)
  await page.mouse.down()
  await page.mouse.move(pull.x + pull.dx, pull.y + pull.dy, { steps: 10 })
  await page.waitForTimeout(150)

  if (pull.during !== undefined) {
    await pull.during()
  }

  await page.mouse.up()

  // the pass of the sizes waits a quarter of a second after the last change of the layout
  await page.waitForTimeout(600)
}

test('a container border leaves the lock of the jump alone, the camera takes the difference', async ({ page }) => {
  const locked = await openWithALockedJump(page)
  const camera = await boxOf(page, 'camera-controls')
  const view = await boxOf(page, '3d-view')

  // the border between the left column and the middle one
  let held = locked

  await dragBorder(page, {
    x: view.left - 2,
    y: view.top + 200,
    dx: 60,
    dy: 0,
    during: async () => {
      held = await boxOf(page, 'jump-to-location')
    },
  })

  // the locked widget keeps its size even while the border moves: the camera gives the room
  const cameraAfter = await boxOf(page, 'camera-controls')
  const after = await boxOf(page, 'jump-to-location')

  expect(held.left).toBe(locked.left)
  expect(held.width).toBe(locked.width)
  expect(cameraAfter.width).toBe(camera.width - 60)

  // and the lock is the size it had: a container drag is not a new size of the widget
  expect(await lockOf(page, 'jump-to-location')).toEqual({ width: locked.width, height: locked.height })
  expect(after.width).toBe(locked.width)
})

test('the own border of the jump writes the new width as its lock', async ({ page }) => {
  const locked = await openWithALockedJump(page)
  let badge = ''
  let during = await boxOf(page, 'jump-to-location')

  // the border between the camera form and the jump
  await dragBorder(page, {
    x: locked.left - 2,
    y: locked.top + Math.round(locked.height / 2),
    dx: 80,
    dy: 0,
    during: async () => {
      during = await boxOf(page, 'jump-to-location')
      badge = (await page.locator('[data-widget-kind="jump-to-location"] .WidgetOverlay .size').textContent()) ?? ''
    },
  })

  const after = await boxOf(page, 'jump-to-location')

  // the badge of the plate follows the border: while the button is down it already shows the new width
  expect(during.width).toBe(locked.width - 80)
  expect(badge).toBe(`${String(during.width)} × ${String(during.height)}`)

  expect(after.width).toBe(locked.width - 80)
  expect(after.left).toBe(locked.left + 80)
  expect(await lockOf(page, 'jump-to-location')).toEqual({ width: after.width, height: locked.height })
})

test('the border above the row writes the new height as the lock of the jump', async ({ page }) => {
  const locked = await openWithALockedJump(page)
  const view = await boxOf(page, '3d-view')

  // the border between the thin row of the camera and the walkable view: it sets the height of the row
  await dragBorder(page, { x: locked.left + Math.round(locked.width / 2), y: view.top - 2, dx: 0, dy: 40 })

  const after = await boxOf(page, 'jump-to-location')
  const viewAfter = await boxOf(page, '3d-view')

  expect(after.height).toBe(locked.height + 40)
  expect(after.width).toBe(locked.width)
  expect(await lockOf(page, 'jump-to-location')).toEqual({ width: locked.width, height: after.height })
  expect(viewAfter.top).toBe(view.top + 40)
})
