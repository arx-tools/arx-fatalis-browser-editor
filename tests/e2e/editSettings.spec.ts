import { expect, test } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import { renameKinds, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The settings of the edit, on the dock.
 *
 * @remarks
 * The settings are a preference of the editor, kept in the browser: the test reads the storage to see that a switch
 * wrote it, and reloads the page to see that the widget takes it back. The magnet of the 3D view is the same switch as
 * the master of the widget, so the two have to agree.
 */
test('the edit settings widget writes the snapping, and keeps it across a reload', async ({ page }) => {
  test.setTimeout(120_000)

  // the factory layout does not carry the settings: the widget takes the row of the polygon inspector for the test
  await seedLayout(page, renameKinds(testLayout, { [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.editSettings }))

  // the blank level needs no data directory: the widget is the same on every level
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  const widget = page.locator(`[data-widget-kind="${WIDGET_KINDS.editSettings}"]`)
  const magnet = page.locator('[data-widget-kind="3d-view"] .snap-toggle')
  const snapping = widget.getByLabel('Snapping')
  const vertex = widget.getByLabel('Snap to vertex')
  const edge = widget.getByLabel('Snap to edge')
  const face = widget.getByLabel('Snap to face')
  const threshold = widget.getByLabel('Snap threshold in pixels')

  await expect(widget).toBeVisible()

  // the defaults: the snap is off, every kind of it is on, and the threshold is the 20 pixels the owner asked for
  await expect(snapping).not.toBeChecked()
  await expect(vertex).toBeChecked()
  await expect(edge).toBeChecked()
  await expect(face).toBeChecked()
  await expect(threshold).toHaveValue('20')

  // the master switch is the magnet of the 3D view: turning it on here lights the magnet up
  await snapping.check()
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('vertexSnapEnabled')
      })
    })
    .toBe('true')

  await edge.uncheck()
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('snapEdgeEnabled')
      })
    })
    .toBe('false')

  await threshold.fill('35')
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('snapThresholdPx')
      })
    })
    .toBe('35')

  // a value outside the range is clamped, so the stored setting is always one a later build can read
  await threshold.fill('100')
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('snapThresholdPx')
      })
    })
    .toBe('80')
  await expect(threshold).toHaveValue('80')

  await threshold.fill('35')

  // the browser keeps the settings: a reload brings the widget back with them
  await page.reload()
  await waitForLevel(page)

  const again = page.locator(`[data-widget-kind="${WIDGET_KINDS.editSettings}"]`)

  await expect(again.getByLabel('Snapping')).toBeChecked()
  await expect(again.getByLabel('Snap to vertex')).toBeChecked()
  await expect(again.getByLabel('Snap to edge')).not.toBeChecked()
  await expect(again.getByLabel('Snap to face')).toBeChecked()
  await expect(again.getByLabel('Snap threshold in pixels')).toHaveValue('35')
  await expect(page.locator('[data-widget-kind="3d-view"] .snap-toggle')).toHaveAttribute('aria-pressed', 'true')
})
