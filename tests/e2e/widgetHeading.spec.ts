import { expect, test, type Page } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The heading of a widget is one line, with an action on it or without one.
 *
 * @remarks
 * The owner measured the three widgets of the info work (2026-11-22): the Light Editor had its title on the very edge of
 * the widget, the Light Inspector a step lower, and the Group Inspector (which carries the `+` of a new group) lower
 * still, because the heading had no height of its own and the root of every widget padded the top as it liked. The
 * heading is now a 22px line (the height of the action) with the title centered in it, and the widgets keep their
 * horizontal and bottom padding only, so the title sits in the same place everywhere and the heading's height does not
 * jump when a widget has an action.
 */
type Heading = {
  /**
   * The height of the whole heading, in whole pixels.
   */
  readonly height: number
  /**
   * How far the title sits from the top of the widget, in whole pixels.
   */
  readonly titleTop: number
  /**
   * How far the rule under the title starts from the left edge of the widget, in whole pixels.
   */
  readonly ruleLeft: number
  /**
   * How far the middle of the title sits from the middle of the line, in pixels.
   */
  readonly centeredBy: number
  /**
   * Whether the heading carries an action (a button in its slot).
   */
  readonly hasAction: boolean
}

/**
 * Measures the heading of a widget.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns Its heading's height, the title's distance from the top, and whether it has an action.
 */
async function headingOf(page: Page, kind: string): Promise<Heading> {
  return await page.locator(`[data-widget-kind="${kind}"]`).evaluate((node) => {
    const heading = node.querySelector('.WidgetHeading')
    const title = heading?.querySelector('.title')
    const widgetBox = node.getBoundingClientRect()
    const headingBox = heading?.getBoundingClientRect()
    const titleBox = title?.getBoundingClientRect()

    let height = -1
    let titleTop = -1
    let ruleLeft = -1
    let centeredBy = -1

    if (headingBox !== undefined) {
      height = Math.round(headingBox.height)
      ruleLeft = Math.round(headingBox.left - widgetBox.left)
    }

    if (headingBox !== undefined && titleBox !== undefined) {
      titleTop = Math.round(titleBox.top - widgetBox.top)

      // the line the border draws: the heading without its 5px padding above and below and its 1px rule
      const lineTop = headingBox.top + 5
      const lineBottom = headingBox.bottom - 6
      const lineMiddle = (lineTop + lineBottom) / 2
      const halfTitle = titleBox.height / 2
      const titleMiddle = titleBox.top + halfTitle

      centeredBy = Math.round((titleMiddle - lineMiddle) * 10) / 10
    }

    return {
      height,
      titleTop,
      ruleLeft,
      centeredBy,
      hasAction: heading?.querySelector('.actions') !== null,
    }
  })
}

test('the heading is the same line with and without an action', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 1100 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  // the light work: the two widgets of the right column carry no action
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()

  await expect(page.locator('[data-widget-kind="light-editor"]')).toBeVisible()

  const editor = await headingOf(page, 'light-editor')
  const inspector = await headingOf(page, 'light-inspector')

  expect(editor.hasAction).toBe(false)
  expect(inspector.hasAction).toBe(false)
  expect(editor.height).toBe(inspector.height)
  expect(editor.titleTop).toBe(inspector.titleTop)

  // the title sits in the middle of the line the rule draws (the owner: the air above it is the air below it), and the
  // rule and the content start at the same inset on every widget
  expect(Math.abs(editor.centeredBy)).toBeLessThanOrEqual(1)
  expect(editor.ruleLeft).toBeGreaterThan(0)
  expect(inspector.ruleLeft).toBe(editor.ruleLeft)
  expect(inspector.titleTop).toBe(editor.titleTop)

  // the group inspector carries the `+` of a new group, and its heading is the same line
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Editor' }).click()

  await expect(page.locator('[data-widget-kind="group-inspector"]')).toBeVisible()

  const groups = await headingOf(page, 'group-inspector')

  expect(groups.hasAction).toBe(true)
  expect(groups.height).toBe(editor.height)
  expect(groups.titleTop).toBe(editor.titleTop)
  expect(groups.ruleLeft).toBe(editor.ruleLeft)
  expect(groups.centeredBy).toBe(editor.centeredBy)
})
