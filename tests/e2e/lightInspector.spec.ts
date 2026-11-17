import { expect, test } from '@playwright/test'
import { editorUrl, readPose, waitForLayoutSettled } from './support/editor.ts'

/**
 * The Light Inspector: the `Lighter` preset carries it, the rows are the lights of the level, and a row picks one.
 *
 * @remarks
 * The list reads the lights of the LLF, which the editor downloads with the level: no data directory is needed. The
 * shape filter and the search are the two ways into a level of a few hundred lights, and the pick of a row writes the
 * same store the marker of the walkable view writes.
 */
test('the Lighter preset carries the Light Inspector, and a row picks a light', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await expect(inspector).toBeVisible()
  // the light work reads the lights in the place of the faces: the selection inspector is not in this preset
  await expect(page.locator('[data-widget-kind="selection-inspector"]')).toHaveCount(0)

  const rows = inspector.locator('.light')

  // the Lighter preset has no statistics to tell the level is on: the rows of the list are the signal
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  expect(await rows.count()).toBeGreaterThan(0)
  await expect(inspector.locator('.selection')).toContainText('lights')

  // a click replaces the pick of the lights
  await rows.first().click()
  await expect(rows.first()).toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).toContainText('1 selected')

  // shift adds the second one to the pick
  if ((await rows.count()) > 1) {
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await expect(inspector.locator('.selection')).toContainText('2 selected')
  }

  // the ScanSearch of a row jumps to the light: the camera moves, and the row picks the light
  const before = await readPose(page)

  await rows.first().locator('.jump').click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')
  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return pose.x
    })
    .not.toBe(before.x)

  // a plain click on the row that is the only pick takes the pick away, the way a row of the rooms does
  await rows.first().click()
  await expect(rows.first()).not.toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).not.toContainText('selected')

  // the C key clears the lights, the same key that clears the faces
  await rows.first().click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')
  await page.keyboard.press('c')
  await expect(rows.first()).not.toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).not.toContainText('selected')

  // the shape filter narrows the list to the fire lights
  await inspector.locator('.shape-filter').selectOption('flame')

  const labels = await inspector.locator('.shape').allInnerTexts()

  expect(labels.length).toBeGreaterThan(0)
  expect(
    labels.every((label) => {
      return label === 'Fire'
    }),
  ).toBe(true)

  // the search reads the index of a light
  await inspector.locator('.shape-filter').selectOption('all')
  await inspector.locator('input[type="search"]').fill('#0')
  await expect(inspector.locator('.index').first()).toHaveText('light 0')
})
