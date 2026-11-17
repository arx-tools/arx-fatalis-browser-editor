import { expect, test, type Locator, type Page } from '@playwright/test'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import type { LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import {
  lockPointer,
  seedLayout,
  selectionCount,
  statOf,
  waitForLayoutSettled,
  waitForLevel,
} from './support/editor.ts'

/**
 * The two inspectors of the test beside the walkable view, with the numbers on the left.
 *
 * @remarks
 * The groups are made of faces, and the quickest way to a selection of faces without the pointer lock is the room
 * inspector: a click on a room selects its faces, so a test can make a group of a known set of them. The two lists share
 * a column, tall enough for the moves of the room inspector under its list.
 *
 * @returns The tree to put into the storage.
 */
function groupsLayout(): LayoutNode {
  return {
    type: 'split',
    orientation: 'horizontal',
    sizes: [
      { kind: 'fixed', px: 350 },
      { kind: 'auto', ratio: 1 },
      { kind: 'fixed', px: 350 },
    ],
    children: [
      {
        type: 'split',
        orientation: 'vertical',
        sizes: [
          { kind: 'fixed', px: 203 },
          { kind: 'auto', ratio: 1 },
        ],
        children: [
          { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
          { type: 'widget', kind: WIDGET_KINDS.selectionInspector },
        ],
      },
      { type: 'widget', kind: WIDGET_KINDS.view3d },
      {
        type: 'split',
        orientation: 'vertical',
        sizes: [
          { kind: 'auto', ratio: 1 },
          { kind: 'auto', ratio: 1 },
        ],
        children: [
          { type: 'widget', kind: WIDGET_KINDS.roomInspector },
          { type: 'widget', kind: WIDGET_KINDS.groupInspector },
        ],
      },
    ],
  }
}

/**
 * The group inspector of the page.
 *
 * @param page The page to read.
 *
 * @returns The widget.
 */
function groupInspector(page: Page): Locator {
  return page.locator('[data-widget-kind="group-inspector"]')
}

/**
 * The room inspector of the page.
 *
 * @param page The page to read.
 *
 * @returns The widget.
 */
function roomInspector(page: Page): Locator {
  return page.locator('[data-widget-kind="room-inspector"]')
}

/**
 * The select of the maps in the header.
 *
 * @param page The page to read.
 *
 * @returns The combobox the header shows.
 */
function mapSelect(page: Page): Locator {
  return page.getByRole('combobox', { name: /The maps the editor can open/u })
}

/**
 * Selects the faces of the first room of the room inspector.
 *
 * @param page The page to drive.
 */
async function pickFirstRoom(page: Page): Promise<void> {
  await roomInspector(page).locator('li.room').first().click()
}

/**
 * Makes a group of the selected faces with the hotkey.
 *
 * @param page The page to drive.
 */
async function groupTheSelection(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+g')
}

/**
 * The names of the sections of the group inspector.
 *
 * @param page The page to read.
 *
 * @returns The titles, in the order the widget shows them.
 */
async function sectionTitles(page: Page): Promise<string[]> {
  return await groupInspector(page)
    .locator('li.section')
    .evaluateAll((sections) => {
      return sections.map((section) => {
        return (section.textContent ?? '').trim()
      })
    })
}

test.setTimeout(120_000)

/**
 * The group inspector is the free widget under the plan of the editor preset (2026-11-16, the owner: the left and front
 * elevations made room for the groups).
 */
test('the editor preset carries the group inspector under the plan', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, editorLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  const plan = await page.locator('[data-widget-kind="top-view"]').evaluate((node) => {
    return node.getBoundingClientRect().top
  })
  const groups = await groupInspector(page).evaluate((node) => {
    const box = node.getBoundingClientRect()

    return { top: box.top, width: box.width }
  })

  expect(groups.width).toBe(360)
  expect(groups.top).toBeGreaterThan(plan)
  await expect(groupInspector(page).locator('.selection')).toHaveText('No faces are selected')
})

/**
 * Ctrl+G makes a group of the selected faces, and a click on its row selects them again.
 *
 * @remarks
 * The group is not a copy of the faces: it is a name and a set of them, and a click picks the set back, the way a room
 * row does: a plain click replaces the selection, `Shift` adds, `Ctrl` takes away.
 */
test('Ctrl+G makes a group of the selection, and its row picks the faces back', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)

  await groupTheSelection(page)

  const groups = groupInspector(page).locator('li.group')

  await expect(groups).toHaveCount(1)
  await expect(groups.first()).toContainText('group 1')
  await expect(groups.first()).toContainText(`${String(faces)} faces`)
  expect(await sectionTitles(page)).toEqual(['Blank: Flat Plane'])

  // the click on the picked room again clears the selection, and the row has the faces to pick back
  await pickFirstRoom(page)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  await groups.first().click()

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)

  // shift adds the same faces (nothing changes), ctrl takes them away
  await groups.first().click({ modifiers: ['Shift'] })

  expect(await selectionCount(page)).toBe(faces)

  await groups.first().click({ modifiers: ['ControlOrMeta'] })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)
})

/**
 * A group keeps its name and its faces in the browser.
 *
 * @remarks
 * The name is renamed in the row (a double click), the way a room is, and the storage carries the group with the level it
 * belongs to: the next visit finds the same row and the same count.
 */
test('the name of a group stays in the browser', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const row = groupInspector(page).locator('li.group').first()

  await row.dblclick()

  // the field carries the default name, selected: a typing is the name
  const field = row.locator('.rename')

  await expect(field).toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('group 1')

  const selection = await field.evaluate((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return { start: -1, end: -1 }
    }

    return { start: input.selectionStart ?? -1, end: input.selectionEnd ?? -1 }
  })

  expect(selection).toEqual({ start: 0, end: 7 })

  // typing over the selected text is the rename, and Enter writes it down
  await field.fill('the floor')
  await field.press('Enter')

  await expect(row).toContainText('the floor')

  // the store writes the group into the browser, with the level it was made on
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('faceGroups')
      })
    })
    .toContain('"title":"Blank: Flat Plane"')

  await page.reload()
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await expect(groupInspector(page).locator('li.group').first()).toContainText('the floor')
  expect(await sectionTitles(page)).toEqual(['Blank: Flat Plane'])

  // an empty (or whitespace) name is not a name: the row falls back to the default of the id
  const after = groupInspector(page).locator('li.group').first()

  await after.dblclick()

  const afterField = after.locator('.rename')

  await afterField.fill(' '.repeat(3))
  await afterField.press('Enter')

  await expect(after).toContainText('group 1')
})

/**
 * The pencil of a row opens the name, without a double click.
 */
test('the pencil of a group opens its name', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const row = groupInspector(page).locator('li.group').first()

  await row.locator('.edit').click()

  const field = row.locator('.rename')

  await expect(field).toBeVisible()
  await expect(field).toBeFocused()
  await expect(field).toHaveValue('group 1')

  await field.fill('Floor')
  await field.press('Enter')

  await expect(row).toContainText('Floor')
})

/**
 * The group operations are steps of the history: a create, a rename and a delete are taken back and made again.
 *
 * @remarks
 * The step is metadata, so the undo does not touch the faces of the level; the store of the groups writes the state into
 * the browser, and a reload finds the groups and their names.
 */
test('the group operations are steps of the history', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const rows = groupInspector(page).locator('li.group')

  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('group 1')

  // the undo of the create takes the group out, the redo brings it back
  await page.keyboard.press('ControlOrMeta+z')
  await expect(rows).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+y')
  await expect(rows).toHaveCount(1)

  // a rename is a step too
  const row = rows.first()

  await row.dblclick()

  const field = row.locator('.rename')

  await field.fill('Floor')
  await field.press('Enter')

  await expect(row).toContainText('Floor')

  await page.keyboard.press('ControlOrMeta+z')
  await expect(row).toContainText('group 1')

  await page.keyboard.press('ControlOrMeta+y')
  await expect(row).toContainText('Floor')

  // the delete is a step, and its undo brings the group back with its name
  await row.locator('.trash').click()
  await expect(rows).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Floor')

  // a reload reads the groups from the browser
  await page.reload()
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await expect(groupInspector(page).locator('li.group').first()).toContainText('Floor')

  // the steps of the groups are on the stored history too: the rename can be taken back after the reload
  await page.keyboard.press('ControlOrMeta+z')
  await expect(groupInspector(page).locator('li.group').first()).toContainText('group 1')

  await page.keyboard.press('ControlOrMeta+y')
  await expect(groupInspector(page).locator('li.group').first()).toContainText('Floor')
})

/**
 * The trash of a row takes the group out, and the faces stay.
 *
 * @remarks
 * A group is metadata: it is not a step of the history, and its faces are the faces of the level. The trash takes the
 * set out and leaves the level as it was.
 */
test('the trash takes the group out, the faces stay', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const row = groupInspector(page).locator('li.group').first()

  await expect(row).toBeVisible()

  await row.locator('.trash').click()

  await expect(groupInspector(page).locator('li.group')).toHaveCount(0)
  expect(await statOf(page, 'Total faces')).toBe(faces)
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)
})

/**
 * `Delete` takes the picked group out while the list of the groups has the keyboard, and the faces stay.
 */
test('Delete takes the picked group out, the faces stay', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  // the group is picked already (its faces are selected), so a click on it would clear the selection: the faces go first
  await page.keyboard.press('c')

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  const row = groupInspector(page).locator('li.group').first()

  // the click on the row picks the group and takes the focus into the list
  await row.click()

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)

  await page.keyboard.press('Delete')

  await expect(groupInspector(page).locator('li.group')).toHaveCount(0)
  expect(await statOf(page, 'Total faces')).toBe(faces)
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)
})

/**
 * The groups are stored per level, and the widget titles every level the author grouped faces on.
 *
 * @remarks
 * A group never spans two levels: the faces are indices of the level they were made on. The sections of the widget carry
 * the name the header writes the level with (`Blank: Flat Plane`), and the open level comes first.
 */
test('the sections of the group inspector follow the levels', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const flatFaces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)

  // the minimal level of the blank maps: one face, and a group of its own
  await mapSelect(page).selectOption('blank:minimal')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(1)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(2)

  // the open level first, the one that is put away after it
  expect(await sectionTitles(page)).toEqual(['Blank: Minimal', 'Blank: Flat Plane'])

  const rows = groupInspector(page).locator('li.group')

  await expect(rows.nth(0)).toContainText('1 face')
  await expect(rows.nth(1)).toContainText(`${String(flatFaces)} faces`)

  // the storage kept both levels: a reload finds the two sections
  await page.reload()
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  expect(await sectionTitles(page)).toEqual(['Blank: Minimal', 'Blank: Flat Plane'])
  await expect(groupInspector(page).locator('li.group')).toHaveCount(2)
})

/**
 * The group is made under the pointer lock, but its name is not typed there.
 *
 * @remarks
 * A focused field under the lock would take the keys, and the movement reads the pressed keys whatever the focus is:
 * `WASD` would move the camera while the name is typed. The group is saved right away instead, with `group N` of its id,
 * and the author renames it later in the list when the pointer is free. The lock stays, and an `Escape` later is the
 * plain way out of the scene.
 */
test('Ctrl+G under the pointer lock makes the group with its default name', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  // the faces of a room, then the lock of the walkable view: the group is made from the scene
  await pickFirstRoom(page)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await lockPointer(page, view)

  await groupTheSelection(page)

  const row = groupInspector(page).locator('li.group').first()

  await expect(row).toBeVisible()
  await expect(row).toContainText('group 1')
  await expect(row).toContainText(`${String(faces)} faces`)

  // no field takes the keys under the lock
  await expect(groupInspector(page).locator('.rename')).toHaveCount(0)

  const isUnlocked = await page.evaluate(() => {
    return globalThis.document.pointerLockElement === null
  })

  expect(isUnlocked).toBe(false)

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
})
