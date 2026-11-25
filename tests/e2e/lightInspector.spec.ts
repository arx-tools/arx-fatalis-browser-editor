import { expect, test } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import {
  clickCrosshair,
  editorUrl,
  editorUrlForLevel,
  lockPointer,
  readPose,
  renameKinds,
  seedLayout,
  selectionCount,
  waitForLayoutSettled,
  waitForLevel,
  writePose,
} from './support/editor.ts'

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
  await expect(inspector.locator('.total')).toHaveText(/^Total: \d+$/u)

  // a click replaces the pick of the lights
  await rows.first().click()
  await expect(rows.first()).toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).toContainText('1 selected')

  // shift adds the second one to the pick
  if ((await rows.count()) > 1) {
    await rows.nth(1).click({ modifiers: ['Shift'] })
    await expect(inspector.locator('.selection')).toContainText('2 selected')
  }

  // the ScanSearch of a row jumps to the light: the camera moves, and the row picks the light. The Lighter has no camera
  // form any more (2026-11-23), so the pose is read from the url the walkable view writes it into
  const before = new URL(page.url()).searchParams.get('position')

  await rows.first().locator('.jump').click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')
  await expect
    .poll(() => {
      return new URL(page.url()).searchParams.get('position')
    })
    .not.toBe(before)

  // a plain click on the row that is the only pick takes the pick away, the way a row of the rooms does
  await rows.first().click()
  await expect(rows.first()).not.toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).toHaveCount(0)

  // the C key clears the lights, the same key that clears the faces
  await rows.first().click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')
  await page.keyboard.press('c')
  await expect(rows.first()).not.toHaveClass(/is-selected/)
  await expect(inspector.locator('.selection')).toHaveCount(0)

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

/**
 * A plain click is a new selection: a light takes the faces away, and a face takes the lights away. Shift keeps both.
 *
 * @remarks
 * The two selections still live in two stores (the unified selection is the 254): the gesture clears the other kind on
 * the replace mode, and the Light Inspector's row does the same. The layout is the editor preset with the light
 * inspector in the place of the polygon inspector, so the Selection Inspector and the Light Inspector are on the dock
 * together, and the camera form aims the walkable view.
 */
test('a light click takes the face selection away without shift', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, renameKinds(testLayout, { [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.lightInspector }))
  await page.goto(editorUrl())
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  const inspector = page.locator('[data-widget-kind="light-inspector"]')
  const rows = inspector.locator('.light')

  await expect(rows.first()).toBeVisible()

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()

  // the spawn pose, read before the lock: the click that takes the lock also turns the camera
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)

  // a plain click on the level takes a face
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  // the pointer lock goes, so the row of the list can take the click: the key of the browser is not enough in the
  // headless run, the document gives the pointer back
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement === null
      })
    })
    .toBe(true)

  // the row takes the light, and the face goes with the old selection
  await rows.first().click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  // the view takes the pointer again, and a shift click on the level adds a face, and the light stays
  await lockPointer(page, view)
  await writePose(page, spawn)
  await clickCrosshair(view, { shift: true })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)
  await expect(inspector.locator('.selection')).toContainText('1 selected')
})

/**
 * A level of a few hundred lights: the list draws a window of the rows, not every row.
 *
 * @remarks
 * Level 0 has 376 lights, and mounting every row (and its tooltips) on a preset switch was the hitch of the Lighter
 * preset (2026-11-23, the owner: the Light Inspector dragged into the Painter layout on level 0). The list draws the
 * rows the box shows, plus a few; the scrollbar still covers the whole list, so the last light stays reachable.
 */
test('a level of hundreds of lights draws a window of the list, and reaches the last light', async ({ page }) => {
  test.setTimeout(120_000)

  await page.setViewportSize({ width: 1631, height: 850 })
  // the level is a few megabytes of the game: the list starts empty, and the wait below is on the list, not on the dock
  // (the sizes of the dock settle long before the level arrives)
  await page.goto(editorUrlForLevel(0))
  await page.keyboard.press('F5')

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await expect(inspector).toBeVisible()

  const line = inspector.locator('.total')

  /**
   * Reads how many lights the line above the list counts.
   *
   * @returns The number of lights, or 0 while the level is on its way.
   */
  async function countOfLights(): Promise<number> {
    const match = /(?<count>\d{1,6})/u.exec((await line.textContent()) ?? '')

    return Number(match?.groups?.count ?? 0)
  }

  // the level is a few megabytes of the game: the list starts empty, and the line counts the lights when it arrives
  await expect.poll(countOfLights, { timeout: 60_000 }).toBeGreaterThan(100)

  const total = await countOfLights()

  const rows = inspector.locator('.light')

  await expect(rows.first()).toBeVisible()
  // the window of the box (about eight rows) and its overscan, not the hundreds of the level
  expect(await rows.count()).toBeLessThan(60)

  // the two kinds of the level are two sections of the one list: the header of the static one is the first entry
  await expect(inspector.locator('.section-head').first()).toContainText('Static lights')
  await expect(inspector.locator('.section-head').first().locator('.value')).not.toHaveText('0')

  // a folded section keeps its header: both headers are on the screen of the top of the list, and the rows of the static
  // section are gone from it
  await inspector.locator('.section-head .head').first().click()

  await expect(inspector.locator('.section-head')).toHaveCount(2)
  await expect(inspector.locator('.section-head').first().locator('.head')).toHaveAttribute('aria-expanded', 'false')
  await expect(inspector.locator('.section-head').nth(1)).toContainText('Dynamic lights')

  // the two sections count the whole level: the split takes no light away
  const counts = await inspector.locator('.section-head .value').allInnerTexts()
  const counted = counts.reduce((sum, text) => {
    return sum + Number(text)
  }, 0)

  expect(counted).toBe(total)

  // the scrollbar covers the whole list: the last entry is one scroll away, and the window follows it
  const box = inspector.locator('.lights')

  await box.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })

  await expect
    .poll(async () => {
      return await box.evaluate((node) => {
        return node.scrollTop + node.clientHeight >= node.scrollHeight - 1
      })
    })
    .toBe(true)

  // the window ends on a light: the list drew the last row of the last section, not a slice of the middle
  await expect(inspector.locator('.light').last().locator('.index')).toHaveText(/^light \d+$/u)

  // the header of the section in view sticks to the top of the box, over the rows of the section
  const headerBox = await inspector.locator('.section-head').last().boundingBox()
  const listBox = await box.boundingBox()

  expect(headerBox !== null && listBox !== null).toBe(true)

  if (headerBox !== null && listBox !== null) {
    expect(Math.abs(headerBox.y - listBox.y)).toBeLessThanOrEqual(1)
  }
})

/**
 * The pick of another widget finds its row: the section of the light opens, the filter that hid it clears, and the row
 * is on the screen of the list.
 *
 * @remarks
 * The owner asked for a light picked in the walkable view to stand on the screen of the inspector (2026-11-24). The
 * second door of the light selection is the row of the selection inspector, which picks the same light again: the list
 * has to answer the pick even when the author folded the section away and the search or the shape filter hides the light.
 * The light is the last one of the level, so its row is under the fold of the small inspector of the editor layout: the
 * reveal scrolls the list, not just opens the section.
 */
test('a pick from another widget opens the section of the light and scrolls to the row', async ({ page }) => {
  test.setTimeout(120_000)

  await page.setViewportSize({ width: 1631, height: 850 })
  // the editor layout with the light inspector in the place of the polygon inspector: the selection inspector is beside
  // it, and the statistics tell when the level is on
  await seedLayout(page, renameKinds(testLayout, { [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.lightInspector }))
  await page.goto(editorUrl())
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  const inspector = page.locator('[data-widget-kind="light-inspector"]')
  const box = inspector.locator('.lights')

  await expect(inspector.locator('.light').first()).toBeVisible()

  // the last light of the level: the end of the list, under the fold of the small inspector
  await box.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })

  await expect
    .poll(async () => {
      return await box.evaluate((node) => {
        return node.scrollTop + node.clientHeight >= node.scrollHeight - 1
      })
    })
    .toBe(true)

  const lastRow = inspector.locator('.light').last()
  const indexLabel = await lastRow.locator('.index').innerText()
  const shapeText = await lastRow.locator('.shape').innerText()
  const sectionText = await lastRow.evaluate((row) => {
    let node: Element | null = row.previousElementSibling

    while (node !== null && !node.classList.contains('section-head')) {
      node = node.previousElementSibling
    }

    return node?.querySelector('.label')?.textContent ?? ''
  })
  const label = indexLabel.trim()
  const shapeOfLast = shapeText.trim()
  const sectionLabel = sectionText.trim()

  // the row picks the light, and then the section folds away and the shape filter hides the light
  await lastRow.click()
  await expect(inspector.locator('.selection')).toContainText('1 selected')

  const head = inspector.locator('.section-head', { hasText: sectionLabel })

  await head.locator('.head').click()
  await expect(head.locator('.head')).toHaveAttribute('aria-expanded', 'false')

  const optionOf: Record<string, string> = {
    'Semi-dynamic': 'bulb',
    Fire: 'flame',
    Off: 'flameCrossed',
    Static: 'star',
  }
  let otherShape = 'flame'

  if (optionOf[shapeOfLast] === 'flame') {
    otherShape = 'star'
  }

  await inspector.locator('.shape-filter').selectOption(otherShape)
  await expect(inspector.locator('.light.is-selected')).toHaveCount(0)

  // the selection inspector lists the picked light, and a pick opens the fold of its kind: a click on the row picks it
  const selection = page.locator('[data-widget-kind="selection-inspector"]')
  const lightsRow = selection.locator('.AccordionRow', { hasText: 'Lights' })

  await expect(lightsRow.locator('.head')).toHaveAttribute('aria-expanded', 'true')

  const selectionRow = selection.locator('.faces li').filter({ hasText: new RegExp(`^${label}$`, 'u') })

  await expect(selectionRow).toHaveCount(1)
  await selectionRow.click()

  // the section is open, the filter is cleared, and the row is inside the box of the list
  await expect(head.locator('.head')).toHaveAttribute('aria-expanded', 'true')
  await expect(inspector.locator('.shape-filter')).toHaveValue('all')
  await expect(inspector.locator('input[type="search"]')).toHaveValue('')
  await expect(inspector.locator('.light.is-selected')).toHaveCount(1)

  const selectedRow = inspector.locator('.light.is-selected')
  const rowBox = await selectedRow.boundingBox()
  const listBox = await box.boundingBox()

  expect(rowBox !== null && listBox !== null).toBe(true)

  if (rowBox === null || listBox === null) {
    throw new Error('the row or the list has no box')
  }

  expect(rowBox.y).toBeGreaterThanOrEqual(listBox.y - 1)
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(listBox.y + listBox.height + 1)

  // the row was under the fold, so the reveal scrolled the list to it
  const scrollTop = await box.evaluate((node) => {
    return node.scrollTop
  })

  expect(scrollTop).toBeGreaterThan(0)
})
