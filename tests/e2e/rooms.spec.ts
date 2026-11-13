import { expect, test } from '@playwright/test'
import { roomsLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import { renameKinds, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The room list and the selection are one thing (TODO 175).
 *
 * @remarks
 * Picking a room in the `Room Inspector` selects its faces, and a selection highlights the rooms it is in. The level of
 * the test is the blank plane: every polygon of it is in room 1, so the row of the room and the count of the selection
 * inspector have to say the same number.
 */
test('a room of the list selects its faces, and a second click clears both', async ({ page }) => {
  test.setTimeout(120_000)

  // the rooms preset has the list and the selection inspector beside the level
  await seedLayout(page, roomsLayout)
  await page.goto('/?map=blank-flat')

  const faces = await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const selectionInspector = page.locator('[data-widget-kind="selection-inspector"]')

  await expect(roomInspector).toBeVisible()

  const row = roomInspector.locator('li.room').first()

  await expect(row).toBeVisible()

  // the blank level has one room, and it holds every face of the level
  await expect(row).toContainText('room 1')

  /**
   * Reads one value of the selection inspector by its label.
   *
   * @param label The label of the row.
   *
   * @returns The text next to the label.
   */
  async function selectedOf(label: string): Promise<string> {
    const cells = selectionInspector.locator('dt')
    const index = await cells.evaluateAll((all, wanted) => {
      return all.findIndex((cell) => {
        return cell.textContent === wanted
      })
    }, label)
    const value = selectionInspector.locator('dd').nth(index)

    return (await value.textContent()) ?? ''
  }

  // nothing is selected before the pick
  expect(await selectedOf('Selected faces')).toBe('0')
  await expect(row).not.toHaveClass(/is-selected/u)

  await row.click()

  // the pick is the selection of the faces of the room, and the row shows it
  await expect(row).toHaveClass(/is-selected/u)
  // the blank plane has a hundred and some faces, so the count has no grouping to write
  expect(await selectedOf('Selected faces')).toBe(String(faces))

  // a second click clears the pick and the selection with it
  await row.click()

  await expect(row).not.toHaveClass(/is-selected/u)
  expect(await selectedOf('Selected faces')).toBe('0')
})

/**
 * The room mapper moves the faces of the selection into a room (TODO 162).
 *
 * @remarks
 * The blank plane has every face in room 1, so a pick of the room selects them, and the mapper can make a new room of
 * them: the level then has room 2 with the faces, and room 1 without them. The step is the history's, so the undo takes
 * the faces back.
 */
test('the mapper makes a room of the selected faces, and the undo takes them back', async ({ page }) => {
  test.setTimeout(120_000)

  // the mapper takes the row of the selection inspector: the count it shows is its own, and the room list stays
  await seedLayout(page, renameKinds(roomsLayout, { [WIDGET_KINDS.selectionInspector]: WIDGET_KINDS.roomMapper }))
  await page.goto('/?map=blank-flat')

  const faces = await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const mapper = page.locator('[data-widget-kind="room-mapper"]')

  await expect(mapper).toBeVisible()

  // the pick of the room selects its faces, which is what the mapper moves
  await roomInspector.locator('li.room').first().click()
  await expect(mapper.locator('.selection')).toContainText(`${String(faces)} face(s) in room 1`)

  await mapper.locator('button', { hasText: 'New room' }).click()

  await expect(mapper.locator('.selection')).toContainText('in room 2')

  // the list shows the rooms the level has a face in: room 1 is empty now, so the one row is the new room
  await expect(roomInspector.locator('li.room')).toHaveCount(1)
  await expect(roomInspector.locator('li.room').first()).toContainText('room 2')
  await expect(roomInspector.locator('li.room').first()).toContainText(String(faces))

  // the step is one of the history: the undo puts every face back into room 1
  await page.keyboard.press('ControlOrMeta+z')

  await expect(mapper.locator('.selection')).toContainText('in room 1')
})
