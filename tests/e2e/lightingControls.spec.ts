import { expect, test } from '@playwright/test'
import { editorUrl, waitForLayoutSettled } from './support/editor.ts'

/**
 * The lighting controls: the `Lighter` preset carries them, and the profile of the bake is a fact of the browser.
 *
 * @remarks
 * The profile is written into the local storage by the store of the lighting, and a reload has to find it again: the
 * author picks one and the next map starts with the same light. The bake itself is the generator's (the widget is the
 * door), so the test reads the storage and the select, not the palette.
 */
test('the Lighter preset brings the lighting controls, and the profile stays in the browser', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await expect(controls).toBeVisible()

  const select = controls.locator('select')

  await expect(select).toHaveValue('Flat')

  await select.selectOption('Realistic')

  // the store writes the profile into the storage: the value is the JSON of the string
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('lightingProfile')
      })
    })
    .toBe('"Realistic"')

  await page.reload()
  await waitForLayoutSettled(page)

  await expect(page.locator('[data-widget-kind="lighting-controls"]')).toBeVisible()
  await expect(page.locator('[data-widget-kind="lighting-controls"] select')).toHaveValue('Realistic')
})

/**
 * The picker lists the categories side by side.
 *
 * @remarks
 * The list of the kinds grew longer than a squeezed window is tall, so the three categories (rendering, controls, info)
 * are the three columns of the popup, each one a list of its own.
 */
test('the picker lists the widgets in three columns', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('button[aria-label="Add a widget"]').click()

  const positions = await page.locator('.WidgetPicker .group').evaluateAll((groups) => {
    return groups.map((group) => {
      return Math.round(group.getBoundingClientRect().x)
    })
  })

  expect(positions.length).toBe(3)
  expect(positions[0]).toBeLessThan(positions[1] ?? 0)
  expect(positions[1]).toBeLessThan(positions[2] ?? 0)
})

/**
 * The flat profile: the slider under the dropdown, and the value it keeps.
 *
 * @remarks
 * The slider is only there for the flat light (0 is dark, 1 is the brightest, in steps of 0.1), and its value is a fact
 * of the browser like the profile: the next visit starts with the same grey.
 */
test('the flat profile brings a luminosity slider, and the value stays', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await controls.locator('select').selectOption('Flat')

  const slider = controls.locator('input[type="range"]')

  await expect(slider).toBeVisible()
  await expect(slider).toHaveValue('0.7')

  await slider.evaluate((element) => {
    if (element instanceof HTMLInputElement) {
      element.value = '0.3'
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('flatLuminosity')
      })
    })
    .toBe('0.3')

  await page.reload()
  await waitForLayoutSettled(page)

  await expect(page.locator('[data-widget-kind="lighting-controls"] select')).toHaveValue('Flat')
  await expect(page.locator('[data-widget-kind="lighting-controls"] input[type="range"]')).toHaveValue('0.3')
})

/**
 * The flat light reads out as a percentage, and the readout keeps the slider in place.
 *
 * @remarks
 * The range is 0..1 in steps of 0.1, so the readout is a whole percent: 0.7 is 70%. Its field has one width for every
 * value, because the readout shares the row with the slider: a field that grows with its number (0% is narrower than
 * 100%) would slide the slider under the hand of the author while the light is dragged.
 */
test('the flat light reads out as a percentage of a fixed width', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')
  const slider = controls.locator('input[type="range"]')
  const readout = controls.locator('.value')

  await expect(readout).toHaveText('70%')

  async function setSlider(value: string): Promise<void> {
    await slider.evaluate((element, next) => {
      if (element instanceof HTMLInputElement) {
        element.value = next
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, value)
  }

  await setSlider('0')

  await expect(readout).toHaveText('0%')

  const atDarkest = await slider.boundingBox()

  await setSlider('1')

  await expect(readout).toHaveText('100%')

  const atBrightest = await slider.boundingBox()

  expect(atDarkest?.x).toBe(atBrightest?.x)
})

/**
 * The dropdown spans the row of the flat light.
 *
 * @remarks
 * The two fields are centered, and the row of the slider (the range and its readout) is wider than a select of its own
 * min-width: the dropdown would sit inside the row, sticking out on neither side. The fields share the width of the
 * widest row instead, so the dropdown, the slider and the readout start and end on the same vertical lines.
 */
test('the dropdown spans the row of the flat light', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await expect(controls).toBeVisible()

  const boxes = await controls.evaluate((widget) => {
    const select = widget.querySelector<HTMLElement>('select')
    const row = widget.querySelector<HTMLElement>(':scope .flat-field .row')

    if (select === null || row === null) {
      throw new Error('The lighting controls have no field to compare.')
    }

    const dropdown = select.getBoundingClientRect()
    const sliderRow = row.getBoundingClientRect()

    return {
      dropdownLeft: dropdown.left,
      dropdownRight: dropdown.right,
      rowLeft: sliderRow.left,
      rowRight: sliderRow.right,
    }
  })

  expect(boxes.dropdownLeft).toBeCloseTo(boxes.rowLeft, 1)
  expect(boxes.dropdownRight).toBeCloseTo(boxes.rowRight, 1)
})

/**
 * The throbber of the bake turns in place, beside the dropdown.
 *
 * @remarks
 * The mark is absolute, so its hidden copy does not move the dropdown off the middle of the widget: its place is held by
 * the translate of its transform. An animation that writes only a rotation into that same property drops the translate,
 * and the mark slides down while it should turn. The animation is paused and walked through, so the test sees the
 * corners of the turn, not whatever frame the machine happened to catch.
 */
test('the throbber of the bake turns in place', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await expect(controls).toBeVisible()

  const offsets = await controls.evaluate((widget) => {
    const spin = widget.querySelector<HTMLElement>('.spin')
    const select = widget.querySelector<HTMLElement>('select')

    if (spin === null || select === null) {
      throw new Error('The lighting controls have no throbber.')
    }

    // the class the store puts on the mark while the bake runs: the style is what this test is about
    spin.classList.add('is-baking')

    const animation = spin.getAnimations()[0]

    if (animation === undefined) {
      throw new Error('The throbber has no animation.')
    }

    animation.pause()

    const offsetsInPixels: number[] = []

    for (const time of [0, 225, 450, 675]) {
      animation.currentTime = time

      const mark = spin.getBoundingClientRect()
      const field = select.getBoundingClientRect()
      const markCenter = (mark.top + mark.bottom) / 2
      const fieldCenter = (field.top + field.bottom) / 2

      offsetsInPixels.push(markCenter - fieldCenter)
    }

    animation.play()

    return offsetsInPixels
  })

  for (const offset of offsets) {
    expect(Math.abs(offset)).toBeLessThan(1)
  }
})
