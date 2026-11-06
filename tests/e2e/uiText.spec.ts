import { expect, test, type Page } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The sentences of the interface: **no em dash and no en dash** anywhere on the screen.
 *
 * @remarks
 * The owner's rule (2026-11-06): an em dash is typography for prose, not for an interface, and the small captions of the
 * editor have no room for it. The replacements are a colon (a name and what it means, like the two blank presets of the
 * level picker) and a plain hyphen (a range, like `1-100 of 2 466`, and the placeholder of an empty value).
 *
 * The scan reads the whole document, not only the widgets: the text of the `<select>` options, the sentences of the
 * header, and the `title`/`aria-label`/`placeholder` attributes (a tooltip is on the screen too, when the pointer rests
 * on the row).
 */
test.setTimeout(120_000)

/**
 * The characters the interface does not use.
 */
const DASHES = ['\u{2014}', '\u{2013}']

/**
 * Finds every em dash and en dash of the page: in the text, and in the text-like attributes.
 *
 * @param page The page to read.
 *
 * @returns One line per hit, with the name of where it came from.
 */
async function dashesOf(page: Page): Promise<string[]> {
  // the scan is an `evaluate` on the body, so the function reaches the page as it is: it reads the node it is given,
  // and no global of the test
  return await page.locator('body').evaluate((body, given: string[]) => {
    const found: string[] = []
    const text = body.textContent ?? ''

    for (const dash of given) {
      let index = text.indexOf(dash)

      while (index >= 0) {
        found.push(`the text: …${text.slice(Math.max(0, index - 30), index + 30)}…`)
        index = text.indexOf(dash, index + 1)
      }
    }

    for (const element of body.querySelectorAll('*')) {
      for (const name of ['title', 'aria-label', 'placeholder', 'alt']) {
        const value = element.getAttribute(name)

        if (value === null) {
          continue
        }

        for (const dash of given) {
          if (value.includes(dash)) {
            found.push(`${name} of a ${element.tagName.toLowerCase()}: ${value}`)
          }
        }
      }
    }

    return found
  }, DASHES)
}

test('the level picker names the blank presets with a colon', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  const labels = await page.locator('select option').evaluateAll((options) => {
    return options.map((option) => {
      return option.textContent ?? ''
    })
  })
  const blanks = labels.filter((label) => {
    return label.includes('Minimal') || label.includes('Flat')
  })

  expect(blanks).toEqual(['Minimal: one quad under the player', 'Flat: 11×11 tiles'])
})

test('the interface shows no em dash and no en dash', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(4)

  // the header (and the level picker, which is a native select: its options are on the page too)
  expect(await dashesOf(page)).toEqual([])

  // the widgets of the texture work: the header of the uv mapper, the list and the inspector
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Painter' }).click()

  await expect(page.locator('.lm-DockPanel-widget')).toHaveCount(6)
  await page.waitForTimeout(800)

  expect(await dashesOf(page)).toEqual([])

  // the two places on these widgets the dash used to be: the name of the uv mapper when no face is selected, and the
  // range of the texture list. (The empty rows of the polygon inspector are the unit test's: a face is under the
  // crosshair of a fresh page, so a row is never empty here.)
  await expect(page.locator('[data-widget-kind="uv-mapper"] .head .name')).toHaveText('no face')

  const pager = page.locator('[data-widget-kind="textures"] .pager')

  // the label is a count when the page holds one texture (the level of the test has one), and a `from-to` range when it
  // holds more: the range of a hyphen is the unit test's (`textureBrowser.spec.ts`), here the dash must be gone
  await expect(pager).toHaveText(/^\d+(?:-\d+)? of [\s\d]+$/u)
})
