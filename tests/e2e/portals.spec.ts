import { expect, test, type Page } from '@playwright/test'
import { roomsLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import {
  clickCrosshair,
  editorUrlForLevel,
  layoutWithTheKeys,
  lockPointer,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
} from './support/editor.ts'

/**
 * Reads the stored value of the portal switch.
 *
 * @param page The page to read.
 *
 * @returns The value of the switch, or `null` while it is the default one (the storage drops it).
 */
async function storedPortals(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    return localStorage.getItem('portalsVisible')
  })
}

/**
 * The portals are a view of the level, and the mesh carries them.
 *
 * @remarks
 * The outline of the portals is not a widget: it is a layer of every view, so the test reads the switch of the layer
 * through the key help (the eye of the row and the key of the action) and the storage the switch lives in. The geometry
 * of the line is the unit test of `portalLinePositions`; here the level 12 is loaded for the portals it has, and the
 * views draw the line without a page error.
 */
test('the portals are a view of the level, under the mesh', async ({ page }) => {
  test.setTimeout(120_000)

  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(String(error))
  })

  // the health of the level is the numbers of the statistics, so the dock holds them beside the keys
  await seedLayout(page, layoutWithTheKeys())
  await page.goto(editorUrlForLevel(12))
  await waitForLevel(page)

  const keys = page.locator('[data-widget-kind="keyboard-shortcuts"]')
  // the title of the section is `View context`, and the rows of the selection also mention it: the header picks the one
  const viewContext = keys.locator('section').filter({
    has: page.locator('h3.section-title', { hasText: 'View context' }),
  })
  const portalsRow = viewContext.locator('dd', { hasText: 'Portals' })
  const portalsEye = portalsRow.locator('button.visibility')
  const meshRow = viewContext.locator('dd', { hasText: 'Mesh' })

  // the row sits under the rooms, with the branch of a child, and it names its key (the fifth row of the section)
  await expect(viewContext.locator('dd .action')).toHaveText([
    'Wireframe',
    'Normals',
    'Mesh',
    'Rooms',
    'Portals',
    'Lights',
    'Entities',
  ])
  await expect(portalsRow.locator('.branch')).toHaveCount(1)
  await expect(viewContext.locator('dt').nth(4).locator('kbd')).toHaveText('P')

  // the layer starts off, and the storage has no entry for the default
  await expect(portalsEye).toHaveAttribute('aria-label', 'Show the portals')
  await expect(portalsEye).toHaveAttribute('aria-pressed', 'false')
  expect(await storedPortals(page)).toBeNull()

  // `P` flips it, and the eye follows
  await page.keyboard.press('p')

  await expect(portalsEye).toHaveAttribute('aria-label', 'Hide the portals')
  await expect(portalsEye).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => {
      return await storedPortals(page)
    })
    .toBe('true')

  // and flips back to the default, which the storage does not keep
  await page.keyboard.press('p')

  await expect(portalsEye).toHaveAttribute('aria-label', 'Show the portals')
  await expect
    .poll(async () => {
      return await storedPortals(page)
    })
    .toBeNull()

  // the eye is the same switch as the key
  await portalsEye.click()

  await expect(portalsEye).toHaveAttribute('aria-label', 'Hide the portals')
  await expect
    .poll(async () => {
      return await storedPortals(page)
    })
    .toBe('true')

  // the mesh goes off: the outline sits over it, so its row waits for the parent, and `P` does not get ahead of the view
  await page.keyboard.press('m')

  await expect(portalsEye).toBeDisabled()
  await expect(meshRow.locator('button.visibility')).toBeEnabled()

  await page.keyboard.press('p')

  await expect
    .poll(async () => {
      return await storedPortals(page)
    })
    .toBe('true')

  // the mesh comes back, and the outline comes back with the value the switch kept
  await page.keyboard.press('m')

  await expect(portalsEye).toBeEnabled()
  await expect(portalsEye).toHaveAttribute('aria-label', 'Hide the portals')

  expect(errors).toEqual([])
})

/**
 * A new room of the flat level gets its portals without a button.
 *
 * @remarks
 * The portals of a flat level are derived from the rooms: a room that is made of a face of the blank plane meets the
 * old room on the four edges of the face, so four quads are built. The statistics, the warning list and the room list
 * read the same map, and the outline of the 215 round follows the generation (the P key shows it). The camera looks
 * down at the plane, so the pick under the crosshair finds a face.
 */
test('a new room of the blank flat plane gets its portals at once', async ({ page }) => {
  test.setTimeout(120_000)

  const errors: string[] = []

  page.on('pageerror', (error) => {
    errors.push(String(error))
  })

  // the rooms preset holds the statistics, the selection and the room inspector
  await seedLayout(page, roomsLayout)
  await page.goto('/?map=blank-flat&position=550,-180,550&rotation=35,180,0')
  await waitForLevel(page)

  // the pose of the url is applied after the level is on: the click of the crosshair needs the camera where the link
  // puts it, or the ray goes to the picture of the load and picks nothing
  await expect(page.locator('[data-widget-kind="3d-view"] .hud')).toContainText(
    /position\s+550\.00\s+-180\.00\s+550\.00/u,
  )

  expect(await statOf(page, 'Portals')).toBe(0)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const inspector = page.locator('[data-widget-kind="room-inspector"]')

  await lockPointer(page, view)

  // the browser locks the pointer asynchronously: the crosshair click has to wait for it, or the view takes the
  // gesture as an editor click and picks nothing
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return globalThis.document.pointerLockElement !== null
      })
    })
    .toBe(true)

  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the camera holds the pointer: let it go, or the canvas eats the click of the button
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })
  await page.waitForTimeout(500)

  await inspector.getByRole('button', { name: 'Put into a new room' }).click()

  await expect
    .poll(async () => {
      return await statOf(page, 'Portals')
    })
    .toBe(4)

  // the two rooms are in the list, and neither is without a portal any more
  await expect(inspector.locator('li.room')).toHaveCount(2)
  await expect(inspector.locator('.problems')).toHaveCount(0)

  expect(errors).toEqual([])
})
