import { expect, test, type Locator, type Page, type Response } from '@playwright/test'

/**
 * The value of a row of the map statistics, as a number.
 *
 * @param page The page to read.
 * @param label The label of the row.
 *
 * @returns The number the row shows, or `undefined` while the row still shows the pending dots.
 */
async function statOf(page: Page, label: string): Promise<number | undefined> {
  const text = await page
    .locator('[data-widget-kind="map-statistics"] dd')
    .nth(
      // the rows are in the order of the widget: the label is what the test knows, the index is not
      await page.locator('[data-widget-kind="map-statistics"] dt').evaluateAll((cells, wanted) => {
        return cells.findIndex((cell) => {
          return cell.textContent === wanted
        })
      }, label),
    )
    .textContent()

  if (text === null || /^\s*…\s*$/u.test(text)) {
    return undefined
  }

  return Number(text.replaceAll(/\s/gu, ''))
}

/**
 * Counts the pixels of the view that are not the empty background.
 *
 * @param view The canvas of the view.
 *
 * @returns The number of lit pixels.
 */
async function litPixels(view: Locator): Promise<number> {
  const shot = await view.screenshot()

  return await view.page().evaluate(async (base64) => {
    const image = new Image()

    image.src = `data:image/png;base64,${base64}`
    await image.decode()

    const surface = document.createElement('canvas')

    surface.width = image.width
    surface.height = image.height

    const context = surface.getContext('2d')

    if (context === null) {
      return 0
    }

    context.drawImage(image, 0, 0)

    const { data } = context.getImageData(0, 0, image.width, image.height)
    let count = 0

    for (let index = 0; index < data.length; index = index + 4) {
      if (data[index] + data[index + 1] + data[index + 2] > 90) {
        count = count + 1
      }
    }

    return count
  }, shot.toString('base64'))
}

/**
 * Puts the pointer into the walkable view, where a click selects a face.
 *
 * @param view The canvas of the view.
 */
async function lockPointer(view: Locator): Promise<void> {
  const box = await view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await view.page().mouse.click(box.x + halfWidth, box.y + halfHeight)
}

/**
 * Clicks the middle of the view without moving it.
 *
 * @param view The canvas of the view.
 */
async function clickMiddle(view: Locator): Promise<void> {
  const box = await view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await view.page().mouse.move(box.x + halfWidth, box.y + halfHeight)
  await view.page().mouse.down()
  await view.page().mouse.up()
}

/**
 * The deletion of the selected faces.
 *
 * @remarks
 * The level comes over the network, from the repository the deployed editor downloads it from too. That is
 * deliberate: this is the only test that needs a real level, and the download is a part of the product that
 * can break on its own (the shape of the urls, the headers of the cdn, a moved file), which a level served
 * from the disk of the checkout would hide. So the test waits for the download instead of mocking it, and it
 * checks that the three files of the level arrived with a 200 before it clicks anything.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the
 * suite does not keep one.
 */
test('a deleted face leaves the rest of the level on the screen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the three files of the level, as they arrive: the test asserts them after the map is on
  const downloads: Response[] = []

  page.on('response', (response) => {
    if (/\/arx-fatalis\/level\d+\//u.test(response.url())) {
      downloads.push(response)
    }
  })

  await page.goto('/')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()

  // the level is on: the statistics stops showing the pending dots
  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(0)

  // and it came whole: three files, all of them read (the order of the three fetches is not fixed)
  const statuses = downloads.map((response) => {
    return response.status()
  })

  expect(statuses).toEqual([200, 200, 200])

  const total = await statOf(page, 'Total faces')
  const litBefore = await litPixels(view)

  // select the face under the crosshair, and take it out of the level
  await lockPointer(view)
  await page.waitForTimeout(500)
  await clickMiddle(view)

  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBeGreaterThan(0)

  const selected = await statOf(page, 'Selected faces')

  await page.keyboard.press('Delete')

  // the model follows: the faces are gone, and the selection is empty
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe((total ?? 0) - (selected ?? 0))

  await expect
    .poll(async () => {
      return await statOf(page, 'Selected faces')
    })
    .toBe(0)

  // and so does the picture: the level lost a face, not itself
  const litAfter = await litPixels(view)

  expect(litAfter).toBeGreaterThan(litBefore * 0.5)
})
