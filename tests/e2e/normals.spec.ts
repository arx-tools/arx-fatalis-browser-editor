import { expect, test, type Page } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import {
  clickCrosshairUntilSelected,
  editorUrl,
  lockPointer,
  renameKinds,
  seedLayout,
  waitForLevel,
} from './support/editor.ts'

/**
 * Reads a value the editor kept in the browser.
 *
 * @param page The page to read.
 * @param key The key of the value.
 *
 * @returns The raw value, or `null` while the default one is in the ref.
 */
async function stored(page: Page, key: string): Promise<string | null> {
  return await page.evaluate((wanted: string) => {
    return localStorage.getItem(wanted)
  }, key)
}

/**
 * The normals of the walkable view: the `N` key flips them, and the widget chooses the layers of the lines.
 *
 * @remarks
 * The lines themselves are the unit tests of `normalsOverlay.ts` (the middle of a face, the corners, the lengths and the
 * colors); here the page proves that the switches reach the view, that the mode buttons wait while the normals are off,
 * and that a level draws them without an error. The level is the small one of the e2e.
 */
test('the normals are a switch of the walkable view, and the widget chooses their layers', async ({ page }) => {
  test.setTimeout(120_000)

  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(String(error))
  })

  // the normals widget takes the row of the polygon inspector, and the keys the row of the selection inspector
  await seedLayout(
    page,
    renameKinds(testLayout, {
      [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.normalsControls,
      [WIDGET_KINDS.selectionInspector]: WIDGET_KINDS.keyboardShortcuts,
    }),
  )

  await page.goto(editorUrl())
  await waitForLevel(page)

  const widget = page.locator(`[data-widget-kind="${WIDGET_KINDS.normalsControls}"]`)
  const power = widget.locator('button[aria-label="Normals"]')
  const vertex = widget.locator('button[aria-label="Vertex normals"]')
  const face = widget.locator('button[aria-label="Face normals"]')

  // the widget is on the dock, off from the start, with the face layer on
  await expect(widget).toBeVisible()
  await expect(power).toHaveAttribute('aria-pressed', 'false')
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  await expect(vertex).toHaveAttribute('aria-pressed', 'false')

  // the layers wait while the normals are off: a switch that is not on the screen has no effect
  await expect(vertex).toBeDisabled()
  await expect(face).toBeDisabled()

  // the eye of the key help writes the same switch
  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')
  const viewContext = keys.locator('section').filter({
    has: page.locator('h3.section-title', { hasText: 'View context' }),
  })
  const normalsRow = viewContext.locator('dd', { hasText: 'Normals' })
  const normalsEye = normalsRow.locator('button.visibility')

  await expect(viewContext.locator('dd .action')).toHaveText([
    'Wireframe',
    'Normals',
    'Mesh',
    'Portals',
    'Rooms',
    'Textures',
    'Lights',
    'Entities',
  ])
  // the row sits under the wireframe, and its cap comes from the key table through the bindings
  await expect(viewContext.locator('dt').nth(1).locator('kbd')).toHaveText('N')
  await expect(normalsEye).toHaveAttribute('aria-label', 'Show the normals')
  expect(await stored(page, 'normalsVisible')).toBeNull()
  expect(await stored(page, 'faceNormalsVisible')).toBeNull()
  expect(await stored(page, 'vertexNormalsVisible')).toBeNull()

  // `N` flips the switch, and the widget follows it
  await page.keyboard.press('n')

  await expect(power).toHaveAttribute('aria-pressed', 'true')
  await expect(normalsEye).toHaveAttribute('aria-label', 'Hide the normals')
  await expect(vertex).toBeEnabled()
  await expect
    .poll(async () => {
      return await stored(page, 'normalsVisible')
    })
    .toBe('true')

  // the two layers are independent switches: the vertex one comes on beside the face one, and the view builds the
  // bigger layer on the screen without an error
  await vertex.click()

  await expect(vertex).toHaveAttribute('aria-pressed', 'true')
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => {
      return await stored(page, 'vertexNormalsVisible')
    })
    .toBe('true')

  // the face layer goes off on its own: the vertex lines stay, and the two off is a state of the switch
  await face.click()

  await expect(face).toHaveAttribute('aria-pressed', 'false')
  await expect(vertex).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => {
      return await stored(page, 'faceNormalsVisible')
    })
    .toBe('false')

  // the key help's eye flips the same switch as the button of the widget
  await normalsEye.click()

  await expect(power).toHaveAttribute('aria-pressed', 'false')
  await expect(vertex).toBeDisabled()

  // a fresh load puts the switches back where they were left. The level is the blank one: the url the view wrote back
  // names the downloaded level as a map of a data dir, and a reload of that asks for the folder
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  await expect(widget).toBeVisible()
  await expect(widget.locator('button[aria-label="Normals"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(widget.locator('button[aria-label="Vertex normals"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(widget.locator('button[aria-label="Face normals"]')).toHaveAttribute('aria-pressed', 'false')
  await expect(widget.locator('button[aria-label="Vertex normals"]')).toBeDisabled()

  expect(errors).toEqual([])
})

/**
 * The lines of the selected faces take their own color, and a selection change does not break the layer.
 *
 * @remarks
 * The two colors of the selection are the unit test of `normalsOverlay.ts` (the plain and the selected halves of a
 * layer); here the page proves that a click of the walkable view reaches the layer: the selection grows, the lines are
 * built again after the throttled wait, and the page has no error. The pointer lock needs chromium (the headless
 * firefox of the suite does not keep one).
 */
test('the lines of the selected faces are built again, without an error', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(String(error))
  })

  // the normals widget takes the row of the polygon inspector, and the selection inspector stays for the count
  await seedLayout(
    page,
    renameKinds(testLayout, {
      [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.normalsControls,
    }),
  )

  await page.goto(editorUrl())
  await waitForLevel(page)

  const widget = page.locator(`[data-widget-kind="${WIDGET_KINDS.normalsControls}"]`)
  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  // both layers on
  await page.keyboard.press('n')

  await expect(widget.locator('button[aria-label="Face normals"]')).toHaveAttribute('aria-pressed', 'true')
  await widget.locator('button[aria-label="Vertex normals"]').click()

  await expect(widget.locator('button[aria-label="Vertex normals"]')).toHaveAttribute('aria-pressed', 'true')

  // the face under the crosshair joins the selection, so its lines go into the selected halves
  await lockPointer(page, view)
  await clickCrosshairUntilSelected(page, view)

  // the rebuild of the lines follows the selection after the throttled wait
  await page.waitForTimeout(1000)

  expect(errors).toEqual([])
})
