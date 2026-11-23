import { expect, test, type Page } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { nextFrames, screenshotDifference, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The gizmos of a light: the move and the scale, and the step each one leaves.
 *
 * @remarks
 * The gizmos are `TransformControls` at the light, so their handles are at a place of the view and not in the DOM. The
 * test jumps to the light (the button of the light inspector), which puts it in the middle of the view: the handles
 * are the pixels around the middle of the canvas. The level is the blank one, whose one light is in the middle of the
 * floor, so the level of the game is not needed. The place of the light is read from the tooltip of the row (the list
 * writes the position there) and the falloff from the number fields of the light editor.
 *
 * The scale gizmo is grabbed at the up handle of the green axis: the middle (uniform) handle scales by the ratio of the
 * pointer's distance from the light at the start and the end of the drag, so a press near the light swings it wide
 * (three's `TransformControls`, measured 2026-11-23); the axis handle is the one a test can read a factor from.
 */
type LightRig = {
  readonly fallEnd: ReturnType<Page['locator']>
  readonly fallStart: ReturnType<Page['locator']>
  readonly redo: ReturnType<Page['locator']>
  readonly row: ReturnType<Page['locator']>
  readonly undo: ReturnType<Page['locator']>
  readonly view: ReturnType<Page['locator']>
}

/**
 * Opens the blank level with the light inspector, and puts the camera in front of its one light.
 *
 * @param page The page to drive.
 *
 * @returns The pieces of the page the tests read.
 */
async function openTheLight(page: Page): Promise<LightRig> {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  // the blank level needs no data dir: its one light is enough for the gizmos
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  // the lighter preset puts the light inspector on the dock
  await page.keyboard.press('F5')
  await expect(page.locator('[data-widget-kind="light-inspector"]')).toBeVisible()

  const rig = {
    fallEnd: page.locator('input[aria-label="Fall end"]'),
    fallStart: page.locator('input[aria-label="Fall start"]'),
    redo: page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Redo"]'),
    row: page.locator('[data-widget-kind="light-inspector"] .light').first(),
    undo: page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]'),
    view: page.locator('[data-widget-kind="3d-view"] canvas').first(),
  }

  await rig.row.click()
  // the jump keeps the orientation and puts the light in the middle of the view: the gizmo is there
  await rig.row.locator('.jump').click()

  return rig
}

/**
 * The two numbers of a light that are on the screen, as the number fields show them.
 *
 * @param rig The pieces of the page.
 *
 * @returns The start and the end of the falloff.
 */
async function radiiOf(rig: LightRig): Promise<{ readonly fallEnd: number; readonly fallStart: number }> {
  return { fallEnd: Number(await rig.fallEnd.inputValue()), fallStart: Number(await rig.fallStart.inputValue()) }
}

/**
 * The middle of the canvas of the view, in the pixels of the page.
 *
 * @param rig The pieces of the page.
 *
 * @returns The two coordinates of the middle.
 */
async function middleOf(rig: LightRig): Promise<{ readonly x: number; readonly y: number }> {
  const box = await rig.view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  return { x: box.x + halfWidth, y: box.y + halfHeight }
}

test('the gizmo moves the light, and the undo takes it back', async ({ page }) => {
  const rig = await openTheLight(page)
  const middle = await middleOf(rig)

  /**
   * The place of the light, from the tooltip of its shape.
   */
  async function positionLabel(): Promise<string | null> {
    await rig.row.locator('.shape').hover()

    const tooltip = page.locator('.v-popper__inner').first()

    await expect(tooltip).toBeVisible()

    return await tooltip.textContent()
  }

  const before = await positionLabel()

  // the selection is not a step of the history: only the drag is
  await expect(rig.undo).toBeDisabled()

  // the red arrow of the gizmo, from the middle of the light to the right
  await page.mouse.move(middle.x + 20, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 80, middle.y, { steps: 10 })
  await page.mouse.up()

  const after = await positionLabel()

  expect(after).not.toBe(before)
  await expect(rig.undo).toBeEnabled()

  await page.keyboard.press('ControlOrMeta+z')
  await expect(rig.undo).toBeDisabled()
  await expect(rig.redo).toBeEnabled()
  await expect.poll(positionLabel).toBe(before)

  await page.keyboard.press('ControlOrMeta+y')
  await expect(rig.undo).toBeEnabled()
  await expect.poll(positionLabel).toBe(after)
})

test('the scale gizmo grows the two radii of the falloff together', async ({ page }) => {
  const rig = await openTheLight(page)
  const middle = await middleOf(rig)

  const before = await radiiOf(rig)

  // the third of the edit modes: the scale gizmo of the same keys as the faces
  await page.keyboard.press('3')

  // the up handle of the green axis, a little above the middle of the light
  await page.mouse.move(middle.x, middle.y - 70)
  await page.mouse.down()
  await page.mouse.move(middle.x, middle.y - 130, { steps: 10 })
  await page.mouse.up()

  const after = await radiiOf(rig)
  const factor = after.fallStart / before.fallStart

  // one factor for both: the shape of the falloff is the one the light had
  expect(after.fallStart).toBeGreaterThan(before.fallStart)
  expect(after.fallEnd).toBeGreaterThan(before.fallEnd)
  expect(after.fallEnd / before.fallEnd).toBeCloseTo(factor, 5)
  await expect(rig.undo).toBeEnabled()

  await page.keyboard.press('ControlOrMeta+z')
  await expect(rig.undo).toBeDisabled()

  const back = await radiiOf(rig)

  expect(back.fallStart).toBeCloseTo(before.fallStart, 5)
  expect(back.fallEnd).toBeCloseTo(before.fallEnd, 5)
})

test('the level follows the light during the drag, not only at its end', async ({ page }) => {
  const rig = await openTheLight(page)
  const middle = await middleOf(rig)

  // the markers go away, so the picture of the two shots of the drag is the light of the level and the gizmo
  await page.keyboard.press('l')
  await nextFrames(page, 3)

  await page.mouse.move(middle.x + 20, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 60, middle.y, { steps: 5 })
  await nextFrames(page, 2)
  const first = await page.screenshot()
  await page.mouse.move(middle.x + 140, middle.y, { steps: 5 })
  await nextFrames(page, 2)
  const second = await page.screenshot()
  await page.mouse.up()

  // the drag moved the light, not the camera: the step is the proof of the grab
  await expect(rig.undo).toBeEnabled()

  const difference = await screenshotDifference(page, first, second)

  // the light of the level walked with the pointer: the baked colors of the floor around it moved, which is more than
  // the pixels of the gizmo itself
  expect(difference.differing).toBeGreaterThan(5000)
})
