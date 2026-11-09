import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * A tooltip is decoration: the click goes through it to the control under it.
 *
 * @remarks
 * floating-vue takes the pointer out of a tooltip that is hidden, and a shown one used to eat the click of the button it
 * belongs to. A button pressed after the pointer rested on it long enough for the tooltip to appear did nothing: the
 * step buttons of the preset menu, the owner's bug (2026-11-09).
 */
test('a step of a layout takes the layout back when the tooltip of its button is already there', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(5)
  await page.waitForTimeout(800)

  // a step of the viewer: the plan comes locked from the preset, so it is unlocked in the edit mode
  await page.locator('header button[aria-label="Unlock the layout"]').click()
  await page.locator('[data-widget-kind="top-view"] button[aria-label="Unlock the widget"]').click()
  await page.waitForTimeout(900)

  const plan = page.locator('[data-widget-kind="top-view"]')

  await expect(plan).not.toHaveAttribute('data-locked-height', /.+/u)

  // the menu, and a real press a whole second after the pointer rested on the undo: the tooltip is on the screen, and it
  // used to eat the click of the button under it (the owner's bug, 2026-11-09 — every step pressed slowly did nothing)
  await page.locator('header button[aria-label="Presets"]').click()

  const undo = page.locator('.preset-row', { hasText: 'Viewer' }).locator('button.step').first()
  const box = await undo.boundingBox()

  expect(box).not.toBeNull()

  if (box === null) {
    return
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await page.mouse.move(box.x + halfWidth, box.y + halfHeight)
  await page.waitForTimeout(1200)

  await expect(page.locator('.v-popper--theme-tooltip .v-popper__inner')).toContainText('Undo the Viewer layout')

  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(900)

  // the step took the layout back: the plan is on the size the preset locked it to
  await expect(plan).toHaveAttribute('data-locked-height', '285')
})
