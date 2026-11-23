import { expect, test, type Page } from '@playwright/test'
import { editorUrl, nextFrames, screenshotDifference, waitForLayoutSettled } from './support/editor.ts'

/**
 * Opens the Lighter preset, where the Light Editor and the Light Inspector sit under the controls.
 *
 * @param page The page of the test.
 */
async function openLighter(page: Page): Promise<void> {
  await page.goto(editorUrl())
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)
}

/**
 * Picks the first light of the list.
 *
 * @param page The page of the test.
 */
async function pickFirstLight(page: Page): Promise<void> {
  await page.locator('[data-widget-kind="light-inspector"] .light').first().click()
}

test('the Light Editor writes the intensity of a light, and the undo takes it back', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')
  const intensity = editor.locator('input[aria-label="Intensity"]')

  await expect(intensity).not.toHaveValue('')

  const before = await intensity.inputValue()

  await intensity.fill('2.5')
  await intensity.press('Tab')

  await expect(page.getByRole('button', { name: /Undo/ })).toBeEnabled()

  await page.getByRole('button', { name: /Undo/ }).click()

  await expect(intensity).toHaveValue(before)
})

/**
 * A number field keeps the value of the light while the text is not a number, and shows the red edge.
 *
 * @remarks
 * A half cleared field must not blank the light of the level (2026-11-21, the owner): the text stays as it is typed, the
 * light keeps the value it had, and the edge of the field says the text is not a number. Leaving the field puts the
 * number back, the way the camera form does.
 */
test('a number field keeps the value when the text is not a number, and shows the red edge', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')
  const intensity = editor.locator('input[aria-label="Intensity"]')

  await expect(intensity).not.toHaveValue('')

  const before = await intensity.inputValue()

  // a text that is not a number: the red edge, and the text stays as typed
  await intensity.fill('abc')
  await expect(intensity).toHaveClass(/invalid/)
  await expect(intensity).toHaveValue('abc')

  // an emptied field is not a number either: the same edge, and the light keeps its value under the text
  await intensity.fill('')
  await expect(intensity).toHaveClass(/invalid/)

  // leaving the field puts the number of the light back, and the edge goes
  await intensity.blur()
  await expect(intensity).toHaveValue(before)
  await expect(intensity).not.toHaveClass(/invalid/)
})

test('a selection of different lights is refused with its reasons', async ({ page }) => {
  await openLighter(page)

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await inspector.locator('.light').nth(0).click()
  await inspector
    .locator('.light')
    .nth(1)
    .click({ modifiers: ['Shift'] })

  const editor = page.locator('[data-widget-kind="light-editor"]')

  await expect(editor).toContainText("Can't edit lights on selection:")
  await expect(editor.locator('input[aria-label="Intensity"]')).toHaveCount(0)
})

test('the color picker changes the color of the light', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')
  // the patch of the picker is the color: the hex is not on the widget any more (2026-11-23, the owner)
  const swatch = editor.locator('.LightColorPicker .ColorSwatch').first()

  await expect(swatch).toBeVisible()

  // the patch is a square, as tall as the three sliders, in every browser
  const box = await editor.evaluate((widget) => {
    const picker = widget.querySelector<HTMLElement>('.LightColorPicker')
    const patch = widget.querySelector<HTMLElement>('.swatch')
    const sliders = widget.querySelector<HTMLElement>('.sliders')

    if (picker === null || patch === null || sliders === null) {
      throw new Error('the light editor has no picker, patch or sliders')
    }

    const patchBox = patch.getBoundingClientRect()
    const slidersBox = sliders.getBoundingClientRect()

    return {
      width: Math.round(patchBox.width),
      height: Math.round(patchBox.height),
      sliders: Math.round(slidersBox.height),
    }
  })

  expect(box.height).toBe(box.sliders)
  expect(box.width).toBe(box.sliders)

  const before = await swatch.evaluate((node) => {
    return getComputedStyle(node).backgroundColor
  })

  await editor.locator('input[aria-label="Hue"]').first().fill('200')

  await expect
    .poll(async () => {
      return await swatch.evaluate((node) => {
        return getComputedStyle(node).backgroundColor
      })
    })
    .not.toBe(before)
  await expect(page.getByRole('button', { name: /Undo/ })).toBeEnabled()
})

/**
 * The two columns of the flags are split by a faint rule.
 *
 * @remarks
 * The six flags of the basic group (and the twelve of the advanced one) are two columns: the caption on the left, the
 * switch on the right, and the switches of the two columns form two ragged edges. The rule between them is what tells
 * the eye which switch belongs to which caption (2026-11-22, the owner): a 1px line of the faint border color in the
 * middle of the gap. It is a pseudo-element of the grid, so the flags stay one two-column grid.
 */
test('the two columns of the flags are split by a faint rule', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const rule = await page
    .locator('[data-widget-kind="light-editor"] .flags')
    .first()
    .evaluate((grid) => {
      const layout = getComputedStyle(grid)
      const line = getComputedStyle(grid, '::after')

      return {
        columns: layout.gridTemplateColumns.split(' ').length,
        gap: Number.parseFloat(layout.columnGap),
        height: Number.parseFloat(line.height),
        width: line.width,
        background: line.backgroundColor,
        gridHeight: grid.getBoundingClientRect().height,
      }
    })

  // the two columns of flags, and the rule in the middle of the gap
  expect(rule.columns).toBe(2)
  expect(rule.gap).toBe(16)
  expect(rule.width).toBe('1px')
  expect(rule.background).not.toBe('rgba(0, 0, 0, 0)')

  // the rule runs down the rows of the group, not just the first one
  expect(rule.height).toBeCloseTo(rule.gridHeight, 1)
})

/**
 * The palette of the level follows a light edit without leaving the field.
 *
 * @remarks
 * The light editor writes the light on the frame of every input, and the palette of the `Arx` profile has to follow it:
 * the surface of the level around the light changes color on the picture, not after the field is left. The undo bakes
 * the same corners back, so the picture of the level before the edit comes back exactly.
 */
test('the Light Editor bakes the palette live, and the undo takes it back', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })

  await page.goto(editorUrl())
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  // the palette is what the Arx profile draws, and only the static lights are in it
  const controls = page.locator('[data-widget-kind="lighting-controls"] select')

  await expect(controls).toBeVisible({ timeout: 60_000 })
  await controls.selectOption('Arx')

  const inspector = page.locator('[data-widget-kind="light-inspector"]')

  await expect(inspector.locator('.light').first()).toBeVisible({ timeout: 60_000 })
  await inspector.locator('select.shape-filter').selectOption('star')

  const row = inspector.locator('.light').first()

  // the jump puts the light in the middle of the walkable view, so its surface is on the picture
  await row.locator('.jump').click()
  await nextFrames(page, 3)
  await page.waitForTimeout(500)

  const stage = page.locator('[data-widget-kind="3d-view"] canvas.stage')
  const before = await stage.screenshot()
  const intensity = page.locator('[data-widget-kind="light-editor"] input[aria-label="Intensity"]')

  await expect(intensity).not.toHaveValue('')

  await intensity.fill('20')
  await intensity.press('Tab')
  await nextFrames(page, 3)

  const brighter = await stage.screenshot()
  const lit = await screenshotDifference(page, before, brighter)

  // the light is much brighter: the surface around it is lighter, not a few of its edges
  expect(lit.differing).toBeGreaterThan(100)
  expect(lit.secondSum).toBeGreaterThan(lit.firstSum)

  await page.getByRole('button', { name: /Undo/ }).click()
  await nextFrames(page, 3)

  const undone = await stage.screenshot()
  const back = await screenshotDifference(page, before, undone)

  // the palette is the same as before the edit: a still camera draws the same picture
  expect(back.differing).toBe(0)
})

/**
 * The fields of a light follow its flags: a static light has no flicker, a fire has its numbers, and a field a flag
 * takes away keeps its value.
 *
 * @remarks
 * A light of level 8 is picked and its flags are set to a known state: the widget shows the flicker only for a
 * semi-dynamic light, the four numbers of the fire only for a fire or a smoke, and the flare only for a flare (TODO 278).
 * The dead flags (`Off`, `No casted`) are not on the widget, and the bits a light carries stay in the file.
 */
test('the fields of the Light Editor follow the flags of the light', async ({ page }) => {
  await openLighter(page)
  await pickFirstLight(page)

  const editor = page.locator('[data-widget-kind="light-editor"]')

  /**
   * Turns a flag of the light to a state.
   *
   * @param name The label of the flag.
   * @param on Whether the flag goes on.
   */
  async function setFlag(name: string, on: boolean): Promise<void> {
    const button = editor.getByRole('button', { name, exact: true })
    const pressed = (await button.getAttribute('aria-pressed')) === 'true'

    if (pressed !== on) {
      await button.click()
    }
  }

  // a static light: no flicker, no fire numbers, no flare
  await setFlag('Semi-dynamic', false)
  await setFlag('Spawn fire', false)
  await setFlag('Spawn smoke', false)
  await setFlag('Flare', false)

  await expect(editor.locator('.field', { hasText: 'Flicker' })).toHaveCount(0)
  await expect(editor.locator('input[aria-label="exRadius"]')).toHaveCount(0)
  await expect(editor.locator('input[aria-label="exFlareSize"]')).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Color legacy', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Fix flare size', exact: true })).toHaveCount(0)

  // the dead flags are not on the widget
  await expect(editor.getByRole('button', { name: 'Off', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'No casted', exact: true })).toHaveCount(0)

  // a semi-dynamic light shows the flicker
  await setFlag('Semi-dynamic', true)
  await expect(editor.locator('.field', { hasText: 'Flicker' })).toHaveCount(1)

  // the fields a flag brings are under a horizontal rule: the same rule as the one between the two columns of the
  // flags, laid down, with the same 8px above and below (2026-11-23, the owner)
  const separator = editor.locator('.separator')

  await expect(separator).toHaveCount(1)

  const rule = await editor.evaluate((widget) => {
    const line = widget.querySelector<HTMLElement>('.separator')
    const flags = widget.querySelector<HTMLElement>('.flags')
    const flicker = [...widget.querySelectorAll<HTMLElement>('.field')].find((field) => {
      return field.querySelector('.caption')?.textContent === 'Flicker'
    })

    if (line === null || flags === null || flicker === undefined) {
      throw new Error('the light editor has no line, no flags or no flicker')
    }

    const lineBox = line.getBoundingClientRect()
    const flagsBox = flags.getBoundingClientRect()
    const flickerBox = flicker.getBoundingClientRect()
    const style = getComputedStyle(line)

    return {
      height: lineBox.height,
      above: Math.round(lineBox.top - flagsBox.bottom),
      below: Math.round(flickerBox.top - lineBox.bottom),
      background: style.backgroundColor,
    }
  })

  expect(rule.height).toBe(1)
  expect(rule.above).toBe(8)
  expect(rule.below).toBe(8)
  expect(rule.background).not.toBe('rgba(0, 0, 0, 0)')

  // the fire shows its numbers, and the values survive the flag
  await setFlag('Spawn fire', true)

  const radius = editor.locator('input[aria-label="exRadius"]')

  await expect(radius).toHaveCount(1)
  await radius.fill('42')
  await radius.press('Tab')
  await expect(editor.getByRole('button', { name: 'Color legacy', exact: true })).toHaveCount(1)

  await setFlag('Spawn fire', false)
  await expect(radius).toHaveCount(0)
  await setFlag('Spawn fire', true)
  await expect(radius).toHaveValue('42')

  // the flare shows its size and its flag
  await setFlag('Flare', true)
  await expect(editor.locator('input[aria-label="exFlareSize"]')).toHaveCount(1)
  await expect(editor.getByRole('button', { name: 'Fix flare size', exact: true })).toHaveCount(1)

  await setFlag('Flare', false)
  await expect(editor.locator('input[aria-label="exFlareSize"]')).toHaveCount(0)
  await expect(editor.getByRole('button', { name: 'Fix flare size', exact: true })).toHaveCount(0)

  // a fire without the flicker: the rule still marks where the fields of the flags begin
  await setFlag('Semi-dynamic', false)
  await expect(editor.locator('.separator')).toHaveCount(1)
})
