import { expect, test, type Locator, type Page } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import type { LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import {
  lockPointer,
  nextFrames,
  readPose,
  screenshotDifference,
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
 * The layout of the tests with the camera form, so a jump can be read back.
 *
 * @remarks
 * The same tree as {@link groupsLayout}, with the camera form at the top of the left column: the form is how a test
 * reads the pose of the camera before and after a jump.
 *
 * @returns The tree to put into the storage.
 */
function groupsLayoutWithCamera(): LayoutNode {
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
        sizes: [{ kind: 'auto', ratio: 1 }],
        children: [
          { type: 'widget', kind: WIDGET_KINDS.cameraControls },
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
 * Puts the pointer away from the widgets of the dock.
 *
 * @remarks
 * The tooltips of the rows are DOM elements over the page, and a screenshot of the canvas takes the elements that stand
 * over it along: a pointer left on a row would put the tooltip of that row into the picture and make two frames of the
 * same level differ. The corner of the header is empty, so the pointer goes there before a screenshot.
 *
 * @param page The page to move the pointer on.
 */
async function pointerAway(page: Page): Promise<void> {
  await page.mouse.move(2, 2)
  await nextFrames(page, 2)
}

test.setTimeout(120_000)

/**
 * The group inspector is the free widget under the plan of the editor preset (2026-11-16, the owner: the left and front
 * elevations made room for the groups).
 */
test('the editor preset carries the group inspector under the plan', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
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

  await row.locator('button[aria-label^="Rename "]').click()

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
  await row.locator('button[aria-label^="Delete "]').click()
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

  await row.locator('button[aria-label^="Delete "]').click()

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
 * The inspector lists the groups of the level on the screen, and no other level's.
 *
 * @remarks
 * The groups of the other levels are the storage of those levels: standing on level 4 there is nothing to do with the
 * groups of level 1, so the widget does not take the room for them. The lists of the two levels are apart in the
 * storage, and a visit to a level finds its own again.
 */
test('the group inspector lists the groups of the level on the screen, and no other', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const flatFaces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await expect(groupInspector(page).locator('li.group').first()).toContainText(`${String(flatFaces)} faces`)

  // a group on the minimal level: the flat level's group is not in its list
  await mapSelect(page).selectOption('blank:minimal')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(1)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(0)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await expect(groupInspector(page).locator('li.group').first()).toContainText('1 face')

  // the flat level kept its own group
  await mapSelect(page).selectOption('blank:flat')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(flatFaces)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await expect(groupInspector(page).locator('li.group').first()).toContainText(`${String(flatFaces)} faces`)

  // the storage keeps the two levels apart
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const raw = localStorage.getItem('faceGroups')

        if (raw === null) {
          return []
        }

        const parsed = JSON.parse(raw) as { readonly maps?: Record<string, unknown> }

        return Object.keys(parsed.maps ?? {})
      })
    })
    .toEqual(expect.arrayContaining(['blank:flat', 'blank:minimal']))
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

/**
 * The eye of a group takes its faces out of the mesh, and the delete gives them back.
 *
 * @remarks
 * The view is not a step of the level: the faces stay in the level (the statistics count them), they are out of the mesh
 * (the picking can not reach them, and the level is drawn without them), and the storage keeps the choice with the group.
 * A hidden group that is deleted gives its faces back, because the group that hid them is gone.
 */
test('the eye of a group takes its faces out of the mesh, and the delete puts them back', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')

  const faces = await waitForLevel(page)

  await waitForLayoutSettled(page)

  // the whole flat level is one room: its row selects every face, and the group is the whole view
  await pickFirstRoom(page)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)

  await groupTheSelection(page)

  const groups = groupInspector(page).locator('li.group')

  await expect(groups).toHaveCount(1)

  const row = groups.first()
  const eye = row.locator('button[aria-pressed]')

  await expect(eye).toHaveAttribute('aria-pressed', 'true')
  await expect(row).toContainText(`${String(faces)} faces`)

  // the selection goes before the picture: a selected face draws a fill, and the hide would drop it
  await page.keyboard.press('c')

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)

  const view = page.locator('[data-widget-kind="3d-view"] canvas.stage')

  await nextFrames(page, 2)
  await pointerAway(page)

  const before = await view.screenshot()

  await eye.click()

  await expect(eye).toHaveAttribute('aria-pressed', 'false')

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return localStorage.getItem('faceGroups')
      })
    })
    .toContain('"visible":false')

  await nextFrames(page, 3)
  await pointerAway(page)

  const hidden = await view.screenshot()
  const gone = await screenshotDifference(page, before, hidden)

  // the level is not drawn: the picture lost its light, and the level keeps its faces
  expect(gone.differing).toBeGreaterThan(50)
  expect(gone.secondSum).toBeLessThan(gone.firstSum)
  expect(await statOf(page, 'Total faces')).toBe(faces)

  await eye.click()

  await expect(eye).toHaveAttribute('aria-pressed', 'true')
  await nextFrames(page, 3)
  await pointerAway(page)

  const back = await view.screenshot()
  const same = await screenshotDifference(page, before, back)

  // the same geometry: a still camera draws the same picture
  expect(same.differing).toBe(0)

  // a hidden group that goes gives its faces back to the mesh
  await eye.click()
  await expect(eye).toHaveAttribute('aria-pressed', 'false')

  await row.locator('button[aria-label^="Delete "]').click()

  await expect(groups).toHaveCount(0)
  await nextFrames(page, 3)
  await pointerAway(page)

  const restored = await view.screenshot()
  const again = await screenshotDifference(page, before, restored)

  expect(again.differing).toBe(0)
})

/**
 * Groups are a lock: the key that makes one takes the same one apart.
 *
 * @remarks
 * The selection of the level is the group (the room row picked its faces), so `Ctrl+G` takes the group apart instead of
 * grouping it again, and the `+` of the heading does nothing while a locked face is selected: a face is in one group at
 * most (2026-11-18, the owner).
 */
test('Ctrl+G takes a group apart, and the add button refuses a locked selection', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const groups = groupInspector(page).locator('li.group')

  await expect(groups).toHaveCount(1)

  // the selection is the whole group: the add button makes no second group of it
  await page.locator('button[aria-label="Group the selected faces"]').click()
  await expect(groups).toHaveCount(1)
  await expect(groups.first()).toContainText(`${String(faces)} faces`)

  // the same key takes the group apart, and the faces stay in the level
  await groupTheSelection(page)

  await expect(groups).toHaveCount(0)

  const level = await statOf(page, 'Total faces')

  expect(level).toBe(faces)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)
})

/**
 * The magnifier of a row goes to the group, from the distance of its size.
 *
 * @remarks
 * The camera keeps its angles and steps back along the forward, so the group is in front of it: the distance follows the
 * box of the group ({@link faceGroupJumpPoseOf}), which is how a small group is looked at from close. The jump selects
 * the faces, so the mark of what the camera went to is on the level.
 */
test('the magnifier of a group goes to it, and picks its faces', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, groupsLayoutWithCamera())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)

  const faces = await selectionCount(page)

  await groupTheSelection(page)

  const row = groupInspector(page).locator('li.group').first()

  await expect(row).toContainText('group 1')

  const before = await readPose(page)
  const start = [before.x, before.z]

  await page.keyboard.press('c')
  await row.locator('button[aria-label^="Jump to "]').click()

  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return [pose.x, pose.z]
    })
    .not.toEqual(start)

  // the angles stay: the jump moves the eye, not the look
  const after = await readPose(page)

  expect(after.yaw).toBe(before.yaw)
  expect(after.pitch).toBe(before.pitch)

  // the faces of the group are the selection the camera went to
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(faces)
})

/**
 * The fill of a group is red, and taking the group apart puts the yellow back without a click.
 *
 * @remarks
 * The color of the fill follows the groups and not only the faces: a group is a lock and its mark says so, and the red
 * has to appear when the group is made and go when it is taken apart, with the selection the same all along (2026-11-18,
 * the owner: the two bugs of the first round).
 */
test('a group is red in the fill, and taking it apart puts the yellow back', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  const view = page.locator('[data-widget-kind="3d-view"] canvas.stage')

  await pickFirstRoom(page)
  await nextFrames(page, 2)

  const yellow = await view.screenshot()

  await groupTheSelection(page)
  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await nextFrames(page, 2)

  const red = await view.screenshot()
  const recolored = await screenshotDifference(page, yellow, red)

  // the faces of the group are red now: the picture of the same selection is another picture
  expect(recolored.differing).toBeGreaterThan(50)

  // the same key takes the group apart: the faces stay in the selection, and the mark is yellow again
  await groupTheSelection(page)
  await expect(groupInspector(page).locator('li.group')).toHaveCount(0)
  await nextFrames(page, 2)

  const back = await view.screenshot()
  const same = await screenshotDifference(page, yellow, back)

  expect(same.differing).toBe(0)
})

/**
 * The groups of another version of the level are kept, and not applied.
 *
 * @remarks
 * A level number opens more than one file (the final release, a demo), and the faces of a group are the indices of the
 * file it was made on: the storage keys the groups by the fingerprint of that file. A level that opens from another file
 * starts without the groups of the first one, the inspector says why, and the groups stay with their own version (a
 * visit back to it finds them again).
 */
test('the groups of another version of the level are kept, and not applied', async ({ page }) => {
  await seedLayout(page, groupsLayout())
  await page.goto('/?map=blank-flat')
  const faces = await waitForLevel(page)
  await waitForLayoutSettled(page)

  await pickFirstRoom(page)
  await groupTheSelection(page)

  const rows = groupInspector(page).locator('li.group')

  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('group 1')

  // the storage keys the groups by the fingerprint of the file the level was loaded from
  const fingerprint = await page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('faceGroups') ?? '{}') as {
      maps?: Record<string, { versions?: Record<string, unknown> }>
    }

    return Object.keys(parsed.maps?.['blank:flat']?.versions ?? {})[0] ?? ''
  })

  expect(fingerprint).toMatch(/^[0-9a-f]{8}:[0-9a-f]+$/u)

  // the same level opens from another file: the group is on another fingerprint, and it is not applied
  await page.evaluate((used) => {
    const parsed = JSON.parse(localStorage.getItem('faceGroups') ?? '{}') as {
      maps: Record<string, { versions: Record<string, unknown> }>
    }
    const { versions } = parsed.maps['blank:flat']

    parsed.maps['blank:flat'].versions = { 'deadbeef:1': versions[used] }
    localStorage.setItem('faceGroups', JSON.stringify(parsed))
  }, fingerprint)

  await page.reload()
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(0)
  await expect(groupInspector(page).locator('.version-note')).toHaveText(
    'Groups of another version of this level are kept, and not shown.',
  )

  // the group of the other version is on the storage all along
  const kept = await page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('faceGroups') ?? '{}') as {
      maps?: Record<string, { versions?: Record<string, unknown> }>
    }

    return Object.keys(parsed.maps?.['blank:flat']?.versions ?? {})
  })

  expect(kept).toEqual(['deadbeef:1'])

  // a visit back to the version the group was made on finds it again
  await page.evaluate((used) => {
    const parsed = JSON.parse(localStorage.getItem('faceGroups') ?? '{}') as {
      maps: Record<string, { versions: Record<string, unknown> }>
    }
    const { versions } = parsed.maps['blank:flat']

    parsed.maps['blank:flat'].versions = { [used]: versions['deadbeef:1'] }
    localStorage.setItem('faceGroups', JSON.stringify(parsed))
  }, fingerprint)

  await page.reload()
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  await expect(groupInspector(page).locator('li.group')).toHaveCount(1)
  await expect(groupInspector(page).locator('li.group').first()).toContainText(`${String(faces)} faces`)
  await expect(groupInspector(page).locator('.version-note')).toHaveCount(0)
})
