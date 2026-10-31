import { expect, test } from '@playwright/test'
import { waitForLevel } from './support/editor.ts'

/**
 * The layout the test starts with: the walkable view on the left, the inspector and the statistics on the right.
 *
 * @remarks
 * The editor reads its layout back from the storage, so the test does not have to drag the inspector out of the
 * picker: it writes the layout the way the shell saves it, and the widget is on the dock when the page loads.
 */
const layout = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [0.6, 0.4],
  children: [
    { type: 'widget', kind: '3d-view' },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [0.5, 0.5],
      children: [
        { type: 'widget', kind: 'polygon-inspector' },
        { type: 'widget', kind: 'map-statistics' },
      ],
    },
  ],
}

/**
 * The polygon inspector: the face under the crosshair of the walkable view.
 *
 * @remarks
 * The level comes over the network (see the note in the spec of the deletion). What the test checks is the chain
 * of the widget: the walkable view picks the face under its crosshair, the store carries the index, the widget
 * reads the polygon and its texture name out of the level. Before the level arrives (and whenever the ray hits
 * nothing) every row shows a dash, and the rows appear as the view reports a face.
 */
test('the inspector describes the face under the crosshair', async ({ page }) => {
  test.setTimeout(120_000)

  await page.addInitScript((seeded: unknown) => {
    localStorage.clear()
    localStorage.setItem('layout', JSON.stringify(seeded))
  }, layout)

  await page.goto('/')

  // the level comes first: the statistics stops showing the pending dots
  await waitForLevel(page)

  const inspector = page.locator('[data-widget-kind="polygon-inspector"]')

  await expect(inspector).toBeVisible()

  /**
   * Reads one row of the widget by its label.
   *
   * @param label The label of the row (the labels are the same before and after the face arrives).
   *
   * @returns The text of the value next to the label.
   */
  async function rowOf(label: string): Promise<string> {
    const index = await inspector.locator('dt').evaluateAll((cells, wanted) => {
      return cells.findIndex((cell) => {
        return cell.textContent === wanted
      })
    }, label)

    return (await inspector.locator('dd').nth(index).textContent()) ?? ''
  }

  // the six rows of the widget, always there: the layout does not jump while the crosshair moves
  await expect(inspector.locator('dt')).toHaveText(['Index', 'Shape', 'Texture', 'Area', 'Room', 'Flags'])

  // the view reported the face under its crosshair: the rows carry the polygon, not dashes
  await expect
    .poll(async () => {
      return await rowOf('Index')
    })
    .toMatch(/^\d+$/u)

  await expect
    .poll(async () => {
      return await rowOf('Shape')
    })
    .toMatch(/^(?:Quad|Triangle)$/u)

  // the texture is named by the level: the widget looks the id of the polygon up among the texture containers
  await expect
    .poll(async () => {
      return await rowOf('Texture')
    })
    .toMatch(/\.(?:bmp|jpg|png)$/iu)

  // the area is a count, grouped with spaces, and the room is an id of the level
  await expect
    .poll(async () => {
      return await rowOf('Area')
    })
    .toMatch(/^\d[\d ]*$/u)

  await expect
    .poll(async () => {
      return await rowOf('Room')
    })
    .toMatch(/^-?\d+$/u)

  // the flags of a real polygon of the level: the shape is not one of them (it has a row of its own)
  await expect
    .poll(async () => {
      return await rowOf('Flags')
    })
    .not.toBe('Quad')
})
