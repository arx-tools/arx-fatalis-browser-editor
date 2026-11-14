import { expect, test, type Locator } from '@playwright/test'
import { roomsLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { ORIGINAL_LEVEL_PARAMETER } from '../../src/editor/modules/level/source/levelSource.ts'
import { editorUrl, seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The url of a level of the game's own files.
 *
 * @remarks
 * The tests that need more than one room read level 12: it has forty one rooms, so a click on a row and a click on
 * another one are two different selections.
 *
 * @param level The number of the level.
 *
 * @returns The url of the editor with that level.
 */
function levelUrl(level: number): string {
  return `/?${ORIGINAL_LEVEL_PARAMETER}=${String(level)}`
}

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

  // the pick does not turn the room map on: the switch of the map stays as the author left it
  await expect(roomInspector.getByRole('button', { name: 'Show the rooms' })).toBeVisible()
  await expect(page.locator('[data-widget-kind="3d-view"] .room-readout')).toHaveCount(0)

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

  // the mapper is one of the widgets of the preset: its selection count is its own, and the room list stays
  await seedLayout(page, roomsLayout)
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

/**
 * The target list of the mapper is a coloured list, and a search narrows it (TODO 180).
 *
 * @remarks
 * The rows are the rooms the room map paints, with the colour of the map and the count of their faces: the swatch of a
 * room is the same colour in the mapper and in the room inspector, because both read the colouring of the level. The
 * search reads the number and the name of a room, and the list says when nothing matches.
 */
test('the mapper lists the rooms with the colour of the map, and the search narrows them', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const mapper = page.locator('[data-widget-kind="room-mapper"]')
  const rows = mapper.locator('li.room')

  await expect(mapper).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(1)

  // the row of a room reads as the row of the inspector: the colour, the number and the count of the faces
  const first = rows.first()

  await expect(first).toContainText('room 1')
  await expect(first).toContainText(/faces?/u)

  async function swatchOf(row: Locator): Promise<string> {
    return await row.locator('.swatch').evaluate((element) => {
      return getComputedStyle(element).backgroundColor
    })
  }

  expect(await swatchOf(first)).toBe(await swatchOf(roomInspector.locator('li.room').first()))

  // the row click is the target of the move, not the pick of the room: the selection is untouched
  await first.click()

  await expect(first).toHaveClass(/is-target/u)
  await expect(mapper.locator('.selection')).toContainText('No faces are selected')

  // the search narrows the list to the rooms whose number it reads
  const all = await rows.count()
  const search = mapper.getByRole('searchbox', { name: 'Search rooms' })

  await search.fill('room 12')

  await expect(rows.first()).toContainText('room 12')
  expect(await rows.count()).toBeLessThan(all)

  // a search that matches nothing leaves the list empty, and the panel says so
  await search.fill('no such room')

  await expect(rows).toHaveCount(0)
  await expect(mapper.locator('.empty')).toContainText('No room matches the search')

  // the clear button empties the field, and the list comes back
  await mapper.getByRole('button', { name: 'Empty the search' }).click()

  await expect(search).toHaveValue('')
  expect(await rows.count()).toBe(all)
})

/**
 * The mapper moves the selected faces into the room picked in its list (TODO 162, 180).
 *
 * @remarks
 * The list is the target of the move: a row click picks the room, the search finds the room to pick, and the move is the
 * step of the history the undo takes back. A target that is the room of the selection already leaves the move off, so a
 * click of the row next door writes nothing into the history.
 */
test('the mapper moves the selection into the room picked in the list', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const mapper = page.locator('[data-widget-kind="room-mapper"]')
  const rows = mapper.locator('li.room')
  const moveButton = mapper.getByRole('button', { name: 'Move', exact: true })
  const search = mapper.getByRole('searchbox', { name: 'Search rooms' })

  // the pick of the room selects its faces, which is what the mapper moves
  await roomInspector.locator('li.room').first().click()
  await expect(mapper.locator('.selection')).toContainText('in room 1')

  // the room of the selection is no target: its move would write the same room back
  await search.fill('room 1')
  await expect(rows.first()).toContainText('room 1')
  await rows.first().click()

  await expect(rows.first()).toHaveClass(/is-target/u)
  await expect(moveButton).toBeDisabled()

  // a row of another room: the move takes the faces there
  await search.fill('room 12')
  await expect(rows.first()).toContainText('room 12')
  await rows.first().click()
  await expect(moveButton).toBeEnabled()

  await moveButton.click()
  await expect(mapper.locator('.selection')).toContainText('in room 12')

  // the undo puts the faces back into room 1
  await page.keyboard.press('ControlOrMeta+z')
  await expect(mapper.locator('.selection')).toContainText('in room 1')
})

/**
 * The list has no checkbox: the pointer previews a room, and the row click picks it.
 *
 * @remarks
 * The checkbox of TODO 176 went away with the persistent highlight it kept: the row click is the only gesture of the
 * list (the pick), and the pointer over a row lights the room while it is there without touching the selection.
 */
test('the pointer previews a room, and the row picks it without a checkbox', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto('/?map=blank-flat')

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const selectionInspector = page.locator('[data-widget-kind="selection-inspector"]')
  const row = roomInspector.locator('li.room').first()

  await expect(row).toBeVisible()
  await expect(row.locator('input[type="checkbox"]')).toHaveCount(0)

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

  // the pointer over the row previews the room, but it is not a pick
  await row.hover()

  await expect(row).not.toHaveClass(/is-selected/u)
  expect(await selectedOf('Selected faces')).toBe('0')

  // the click is the pick, the one gesture the list has
  await row.click()

  await expect(row).toHaveClass(/is-selected/u)
})

/**
 * The view writes the room under the crosshair at the bottom of the canvas while the room map is on.
 *
 * @remarks
 * The map is the overlay that colours the rooms: the line names the room the crosshair is in, so the number and the
 * bright room of the map say the same thing. It stays away while the map is off. The number of the room comes from the
 * washed row of the list, which follows the crosshair without the map.
 */
test('the room under the crosshair is written on the view while the map is on', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(editorUrl())

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const view = page.locator('[data-widget-kind="3d-view"]')
  const readout = view.locator('.room-readout')

  // the map starts off: the view does not write a room
  await expect(readout).toHaveCount(0)

  // the list washes the row of the room the crosshair points at, once the view found one
  const washed = roomInspector.locator('li.room.is-hovered')

  await expect
    .poll(async () => {
      return await washed.count()
    })
    .toBe(1)

  // the name of the row is the number of the room: the count beside it is another cell of the row
  const name = washed.first().locator('.name')
  const room = /room (?<room>\d+)/u.exec((await name.textContent()) ?? '')?.groups?.room ?? ''

  // the map on: the readout writes the room the list washes
  await roomInspector.getByRole('button', { name: 'Show the rooms' }).click()

  await expect(readout).toContainText(`room ${room}`)

  // the map off: the line goes with it
  await roomInspector.getByRole('button', { name: 'Hide the rooms' }).click()

  await expect(readout).toHaveCount(0)
})

/**
 * The crosshair washes the row of its room in the list, and the pointer adds a second wash.
 *
 * @remarks
 * The row of the room the camera points at takes the hover wash, so the list says where the camera is without a click
 * and without the map. The pointer over another row is a preview of that room, so its row joins the wash; leaving the
 * list takes it back, and the row of the crosshair keeps its own.
 */
test('the crosshair washes its row, and the pointer adds another one', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const rows = roomInspector.locator('li.room')
  const washed = roomInspector.locator('li.room.is-hovered')

  // the map is off: the row of the crosshair room is the only washed one
  await expect
    .poll(async () => {
      return await washed.count()
    })
    .toBe(1)

  const name = washed.first().locator('.name')
  const crosshair = /room (?<room>\d+)/u.exec((await name.textContent()) ?? '')?.groups?.room ?? ''

  expect(crosshair).toMatch(/^\d+$/u)

  // the pointer on a row of another room: a second wash, while the crosshair keeps its own
  const label = `room ${crosshair}`
  const texts = await rows.locator('.name').evaluateAll((all) => {
    return all.map((row) => {
      return (row.textContent ?? '').trim()
    })
  })
  const other = texts.findIndex((text) => {
    return text !== label && !text.startsWith(`${label} ·`)
  })

  expect(other).toBeGreaterThanOrEqual(0)

  await rows.nth(other).hover()

  await expect
    .poll(async () => {
      return await washed.count()
    })
    .toBe(2)

  // the pointer off the list: only the crosshair is left
  const heading = await roomInspector.locator('h2').boundingBox()

  if (heading === null) {
    throw new Error('the room inspector has no heading')
  }

  const halfWidth = heading.width / 2
  const halfHeight = heading.height / 2

  await page.mouse.move(heading.x + halfWidth, heading.y + halfHeight)

  await expect
    .poll(async () => {
      return await washed.count()
    })
    .toBe(1)
})

/**
 * `Shift` on a room of the list adds it to the selection, and `Ctrl` takes it away.
 *
 * @remarks
 * The list and the walkable view share the selection: a plain click picks the faces of one room, `Shift` adds another
 * room to them, and `Ctrl` takes one away. More than one row reads as selected, which is the set the map lights.
 */
test('shift on a room of the list adds it to the selection', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const rows = roomInspector.locator('li.room')
  const first = rows.nth(0)
  const second = rows.nth(1)

  await expect(first).toBeVisible()
  await expect(second).toBeVisible()

  // a plain click is the pick of one room
  await first.click()

  await expect(first).toHaveClass(/is-selected/u)
  await expect(second).not.toHaveClass(/is-selected/u)

  // shift adds the second room, and keeps the first one selected
  await second.click({ modifiers: ['Shift'] })

  await expect(first).toHaveClass(/is-selected/u)
  await expect(second).toHaveClass(/is-selected/u)

  // ctrl takes the first one away, and leaves the second in the selection
  await first.click({ modifiers: ['ControlOrMeta'] })

  await expect(first).not.toHaveClass(/is-selected/u)
  await expect(second).toHaveClass(/is-selected/u)
})

/**
 * A `Shift` click on a fixed view selects the room under the pointer, and the camera does not move.
 *
 * @remarks
 * The fixed views are the navigation: a plain click jumps the walkable camera to the place under the pointer. `Shift`
 * belongs to the room map instead: the press adds the room of the face under the pointer to the selection, the same
 * gesture the room list has, and the camera keeps its place. The marker of the top view is the place the walkable
 * camera stands, so the room under it is the one the press reads.
 */
test('a shift click on a fixed view selects a room, and the camera stays', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const hud = page.locator('[data-widget-kind="3d-view"] .hud')

  // the readout of the view holds the pose of the walkable camera: a click that navigates would move these numbers
  await expect
    .poll(async () => {
      return (await hud.textContent()) ?? ''
    })
    .toContain('position')

  const before = (await hud.textContent()) ?? ''

  // the Shift gestures belong to the room map: turn it on first
  await roomInspector.getByRole('button', { name: 'Show the rooms' }).click()

  const marker = page.locator('[data-widget-kind="top-view"] .camera-mark')
  const box = await marker.boundingBox()

  if (box === null) {
    throw new Error('the top view has no marker')
  }

  // Shift and a press: the room of the face under the marker joins the selection
  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await page.keyboard.down('Shift')
  await page.mouse.click(box.x + halfWidth, box.y + halfHeight)
  await page.keyboard.up('Shift')

  await expect
    .poll(async () => {
      return await roomInspector.locator('li.room.is-selected').count()
    })
    .toBeGreaterThan(0)

  // Ctrl on the same place takes the room back out of the selection, and the camera still does not move
  await page.keyboard.down('Control')
  await page.mouse.click(box.x + halfWidth, box.y + halfHeight)
  await page.keyboard.up('Control')

  await expect
    .poll(async () => {
      return await roomInspector.locator('li.room.is-selected').count()
    })
    .toBe(0)

  // the readout still holds the same pose: neither press jumped
  await page.waitForTimeout(400)

  expect((await hud.textContent()) ?? '').toBe(before)
})

/**
 * `Shift` alone lights the room under the pointer of a fixed view, without a move of the mouse.
 *
 * @remarks
 * The pointer of the top view stands on a face of another room, and only the key goes down: the room joins the hover of
 * the crosshair, and the release takes it away again. The point is over a room of level 12 that is not the one of the
 * crosshair, so the two highlights are apart.
 */
test('shift alone lights the room under the pointer of a fixed view', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto(levelUrl(12))

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')

  // the Shift gestures belong to the room map
  await roomInspector.getByRole('button', { name: 'Show the rooms' }).click()

  const top = page.locator('[data-widget-kind="top-view"] canvas.stage')
  const box = await top.boundingBox()

  if (box === null) {
    throw new Error('the top view has no canvas')
  }

  const hovered = roomInspector.locator('li.room.is-hovered')
  const before = await hovered.count()
  const alongX = box.width * 0.4
  const alongY = box.height * 0.3

  /**
   * Counts the rows the hover wash marks.
   *
   * @returns How many rows read as hovered.
   */
  async function hoveredCount(): Promise<number> {
    return await hovered.count()
  }

  // the pointer stands on a face of the top view and does not move: only the key goes down
  await page.mouse.move(box.x + alongX, box.y + alongY)

  await expect.poll(hoveredCount).toBe(before)

  await page.keyboard.down('Shift')

  await expect.poll(hoveredCount).toBeGreaterThan(before)

  await page.keyboard.up('Shift')

  await expect.poll(hoveredCount).toBe(before)
})

/**
 * The author names a room, and the list shows the name beside the id (TODO 177).
 *
 * @remarks
 * The name is metadata: it is not a step of the history, it does not touch the selection, and the row of the room keeps
 * the number the engine uses. The field under the list belongs to the picked room, which is the one the click selected.
 */
test('the name of a room is written under the list, and the row shows it', async ({ page }) => {
  test.setTimeout(120_000)

  await seedLayout(page, roomsLayout)
  await page.goto('/?map=blank-flat')

  await waitForLevel(page)

  const roomInspector = page.locator('[data-widget-kind="room-inspector"]')
  const row = roomInspector.locator('li.room').first()

  await expect(row).toContainText('room 1')
  await expect(roomInspector.locator('.field')).toHaveCount(0)

  // the pick makes the row the one the field names
  await row.click()

  const field = roomInspector.locator('#room-name')

  await expect(field).toHaveAttribute('placeholder', 'Unnamed area')

  await field.fill('The yard')
  await field.blur()

  await expect(row).toContainText('room 1 · The yard')

  // an empty field takes the name away, and the list says the text of the nameless ones
  await field.fill('')
  await field.blur()

  await expect(row).not.toContainText('The yard')
})
