import { expect, test } from '@playwright/test'
import { editorUrl, litPixels, nextFrames, screenshotDifference, waitForLayoutSettled } from './support/editor.ts'

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
 * of the browser like the profile: the next visit starts with the same gray.
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
 * The fields of the lighting controls start at the same column, and the rows fit the height of the Lighter preset.
 *
 * @remarks
 * The caption sits beside the control (2026-11-18): the profile row and the luminosity row start at the same x, after
 * the captions, and the content of the widget fits the height the preset locks, so the caption of the profile is not cut
 * at the top (the 253). The switch of the static lights is only there for the profiles that read the lights (2026-11-22),
 * so the flat profile shows three rows in a box of 130.
 */
test('the fields start at the same column, and the rows fit the Lighter preset', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')

  await expect(controls).toBeVisible()

  const boxes = await controls.evaluate((widget) => {
    const profileRow = widget.querySelector<HTMLElement>(':scope .field:not(.flat-field) .row')
    const flatRow = widget.querySelector<HTMLElement>(':scope .flat-field .row')
    const caption = widget.querySelector<HTMLElement>('.caption')

    if (profileRow === null || flatRow === null || caption === null) {
      throw new Error('The lighting controls have no field to compare.')
    }

    const widgetBox = widget.getBoundingClientRect()
    const captionBox = caption.getBoundingClientRect()

    return {
      profileLeft: Math.round(profileRow.getBoundingClientRect().left),
      flatLeft: Math.round(flatRow.getBoundingClientRect().left),
      captionTop: Math.round(captionBox.top),
      captionBottom: Math.round(captionBox.bottom),
      widgetTop: Math.round(widgetBox.top),
      widgetBottom: Math.round(widgetBox.bottom),
      scrollHeight: widget.scrollHeight,
      clientHeight: widget.clientHeight,
    }
  })

  // the captions take a fixed column, so the controls start at the same x
  expect(boxes.profileLeft).toBe(boxes.flatLeft)

  // the caption is inside the widget: no part of it is cut at the top or the bottom
  expect(boxes.captionTop).toBeGreaterThanOrEqual(boxes.widgetTop)
  expect(boxes.captionBottom).toBeLessThanOrEqual(boxes.widgetBottom)

  // the content fits the locked height, so the widget does not need its scrollbar
  expect(boxes.scrollHeight).toBeLessThanOrEqual(boxes.clientHeight + 1)
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

/**
 * The `Texture Rainbow` profile draws the level with the color of its containers.
 *
 * @remarks
 * The profile multiplies its palette with the texture of the face, and the textures of the game are dark, so the color
 * came out muddy (2026-11-20, the owner). The material keeps a third of the texture under the color (2026-11-22),
 * which is a fragment shader of its own: a shader the renderer can not compile draws nothing, and the console says so,
 * so the test reads the picture and the console together.
 */
test('the Texture Rainbow draws the level with the color of its containers', async ({ page }) => {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })

  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')
  const select = controls.locator('select')

  await select.selectOption('TextureRainbow')
  await expect(select).toHaveValue('TextureRainbow')

  await nextFrames(page, 3)

  // the palette of the profile colors every face: the view is not the gray the flat profile leaves, and not black
  const stage = page.locator('[data-widget-kind="3d-view"] canvas.stage')
  const lit = await litPixels(stage)

  expect(lit).toBeGreaterThan(1000)
  expect(
    errors.filter((text) => {
      return /three|shader/iu.test(text)
    }),
  ).toEqual([])
})

/**
 * The switch of the static lights belongs to the profiles that read the lights.
 *
 * @remarks
 * The `Flat` and the `Texture Rainbow` profiles draw a light of their own, so the static switch would take away nothing
 * there: it is off the widget, and the slider is the light of the level (2026-11-22, the owner). The profiles that read
 * the lights keep the switch and have no slider.
 */
test('the switch of the static lights is only there for the profiles that read the lights', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')
  const select = controls.locator('select')

  await expect(select).toHaveValue('Flat')
  await expect(controls.locator('#static-lights')).toHaveCount(0)
  await expect(controls.locator('#flat-luminosity')).toBeVisible()

  await select.selectOption('TextureRainbow')

  // the rainbow has a light of its own, and the slider starts at the 70% of the default
  await expect(controls.locator('#static-lights')).toHaveCount(0)
  await expect(controls.locator('#rainbow-luminosity')).toBeVisible()
  await expect(controls.locator('.value')).toHaveText('70%')

  await select.selectOption('Arx')

  await expect(select).toHaveValue('Arx')
  await expect(controls.locator('#static-lights')).toHaveCount(1)
  await expect(controls.locator('input[type="range"]')).toHaveCount(0)
})

/**
 * The luminosity of the rainbow darkens the colors of the level.
 *
 * @remarks
 * The profile bakes a hue per texture container at the value of the slider: a step of the slider is a step of the light
 * of the whole level, without a role for the lights of the map (2026-11-22, the owner).
 */
test('the luminosity of the rainbow darkens the colors of the level', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')
  const select = controls.locator('select')

  await select.selectOption('TextureRainbow')

  const slider = controls.locator('#rainbow-luminosity')

  await expect(slider).toHaveValue('0.7')

  const stage = page.locator('[data-widget-kind="3d-view"] canvas.stage')

  await nextFrames(page, 3)

  const bright = await stage.screenshot()

  await slider.evaluate((element) => {
    if (element instanceof HTMLInputElement) {
      element.value = '0.3'
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })

  await expect(controls.locator('.value')).toHaveText('30%')
  await nextFrames(page, 5)

  const dark = await stage.screenshot()
  const lit = await screenshotDifference(page, bright, dark)

  // the level is darker, and not a few pixels of it: the whole palette of the profile
  expect(lit.differing).toBeGreaterThan(1000)
  expect(lit.secondSum).toBeLessThan(lit.firstSum)

  // the value is a fact of the author: the next visit comes back with it
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('rainbowLuminosity')
      })
    })
    .toBe('0.3')
})

/**
 * A profile change does not move the controls of the widget.
 *
 * @remarks
 * The dropdown and the slider of the light take one width (2026-11-22, the owner): the profiles that read the lights
 * have no slider, and a dropdown of its own width would move the captions and the controls under the hand of the author.
 */
test('a profile change does not move the controls of the widget', async ({ page }) => {
  await page.goto(editorUrl())

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)

  const controls = page.locator('[data-widget-kind="lighting-controls"]')
  const select = controls.locator('select')

  const flatSelect = await select.boundingBox()
  const sliderRow = await controls.locator('.flat-field .row').boundingBox()

  // the dropdown is as wide as the row of the slider and its readout
  expect(flatSelect?.width).toBe(sliderRow?.width)

  await select.selectOption('Arx')

  await expect(controls.locator('#static-lights')).toHaveCount(1)

  const arxSelect = await select.boundingBox()

  // the profile without the slider keeps the place of the dropdown, and the width of it
  expect(arxSelect?.x).toBeCloseTo(flatSelect?.x ?? 0, 1)
  expect(arxSelect?.width).toBeCloseTo(flatSelect?.width ?? 0, 1)
})
