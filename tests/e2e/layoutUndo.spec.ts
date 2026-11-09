import { expect, test, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import type { LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import { editorUrl, waitForLevel } from './support/editor.ts'

/**
 * The box of a widget on the dock, in whole pixels.
 *
 * @param page The page to read.
 * @param kind The kind of the widget.
 *
 * @returns The box of its node.
 */
async function boxOf(page: Page, kind: string): Promise<{ left: number; top: number; width: number; height: number }> {
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
 * A step back of a layout keeps the ratios of its flexible children.
 *
 * @remarks
 * The first layout of the dock used to be built from the weights of the tree, where a flexible child is a share of the
 * space the locks leave and lumino reads every weight as a share of the whole split: a ratio next to a locked pixel
 * size collapsed to the css minimums, and the pass wrote the collapsed 50-50 back as a new state — the step looked like
 * a redo (the owner's bug, 2026-11-09).
 */
test('a step back to another ratio of two free widgets keeps the layout and the history', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  // the first state is the editor preset with the two elevations of the left column at 0.4 and 0.6, the second is the
  // factory: the step back has to put the first one on the screen. A ratio next to a locked pixel size used to collapse
  // to the css minimums of lumino, and the pass wrote the collapsed 50-50 back as a new state — so the step looked like
  // it did nothing (the owner's bug, 2026-11-09)
  const factory = structuredClone(editorLayout) as Extract<LayoutNode, { type: 'split' }>
  const [leftColumn, ...restOfEditor] = factory.children as Array<Extract<LayoutNode, { type: 'split' }>>
  const first: Extract<LayoutNode, { type: 'split' }> = {
    ...factory,
    children: [
      {
        ...leftColumn,
        sizes: [
          { kind: 'fixed', px: 350 },
          { kind: 'auto', ratio: 0.4 },
          { kind: 'auto', ratio: 0.6 },
        ],
      },
      ...restOfEditor,
    ],
  }

  await page.addInitScript(
    (states: string) => {
      localStorage.setItem('layoutPreset', JSON.stringify('editor'))
      localStorage.setItem(
        'layoutHistories',
        JSON.stringify({ editor: { states: JSON.parse(states) as unknown, index: 1 } }),
      )
    },
    JSON.stringify([first, editorLayout]),
  )

  await page.goto(editorUrl())
  await waitForLevel(page)
  await page.waitForTimeout(800)

  // the factory state first: the two elevations are the same height
  const leftBefore = await boxOf(page, 'left-view')
  const frontBefore = await boxOf(page, 'front-view')

  expect(Math.abs(leftBefore.height - frontBefore.height)).toBeLessThanOrEqual(2)

  // the step of the row, and the first state comes back
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-row', { hasText: 'Editor' }).locator('button.step').first().click()
  await page.waitForTimeout(900)

  const left = await boxOf(page, 'left-view')
  const front = await boxOf(page, 'front-view')
  const share = left.height / (left.height + front.height)

  expect(share).toBeGreaterThan(0.37)
  expect(share).toBeLessThan(0.43)

  // and the step is where it went: the history has two states, and the cursor is on the first one
  const stored = await page.evaluate(() => {
    return localStorage.getItem('layoutHistories')
  })

  expect(stored).not.toBeNull()

  if (stored !== null) {
    const entry = (JSON.parse(stored) as { editor: { states: unknown[]; index: number } }).editor

    expect(entry.states.length).toBe(2)
    expect(entry.index).toBe(0)
  }
})
