import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The entities of the level: the `E` key flips them, and the key help shows the switch.
 *
 * @remarks
 * The entities are on from the start (they are part of the level, not a debug aid, 2026-11-22, the owner: the first
 * slice of TODO 239), so the row of the key help says "Hide the entities" until the first press. The switch itself is
 * the one the row's eye flips: the test reads the eye, which is the only place the state of the switch reaches the page.
 */
test('the E key flips the entities, and the help follows the switch', async ({ page }) => {
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  const widget = page.locator('[data-widget-kind="keyboard-shortcuts"]')

  // the entities are drawn from the start
  await expect(widget.locator('button[aria-label="Hide the entities"]')).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('e')

  // the press takes them off the frame, and the eye of the row says so
  await expect(widget.locator('button[aria-label="Show the entities"]')).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('e')

  await expect(widget.locator('button[aria-label="Hide the entities"]')).toHaveAttribute('aria-pressed', 'true')
})
