import { expect, test, type Locator } from '@playwright/test'
import {
  clickCrosshair,
  lockPointer,
  readPose,
  seedLayout,
  selectionCount,
  uvLayout,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The uv mapper: the texture of the selected face, its corners, the drag and the undo.
 *
 * @remarks
 * The level is the **blank** one: the widget draws the square only when it has the picture of the texture of the face, and
 * the blank level is the one whose texture the editor always has (the placeholder of the generator). A level of the game
 * opened without a data directory has no texture to show, and the widget says so instead of drawing an empty square (the
 * owner's request, 2026-11-08). The face is taken with the click of the selection spec (the events are dispatched by the
 * page, because a pointer lock turns every real mouse event into a movement). The **drag of a corner** is a real one: the
 * pointer is let go first, so the mouse reaches the corner of the widget and not the canvas of the locked view.
 *
 * It runs only in chromium: the walkable view selects with a pointer lock, and the headless firefox of the suite does
 * not keep one.
 */
test('a corner dragged on the texture moves the uv of the face, and the undo takes it back', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, uvLayout())
  await page.goto('/?map=blank-flat')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const mapper = page.locator('[data-widget-kind="uv-mapper"]')

  await expect(mapper).toBeVisible()

  // without a selection there is no face to edit, and the widget says so, under the frame of the square the texture would
  // be drawn in: the frame keeps the line at the bottom reading as its caption (2026-11-12, the owner)
  await expect(mapper.locator('.hint')).toHaveText('Select one face to edit its texture coordinates.')
  await expect(mapper.locator('.corner')).toHaveCount(0)
  await expect(mapper.locator('.square')).toBeVisible()
  await expect(mapper.locator('.square canvas')).toHaveCount(0)

  const frame = await mapper.locator('.square').evaluate((node) => {
    const style = getComputedStyle(node)

    return { border: style.borderTopColor, background: style.backgroundColor }
  })

  expect(frame.border).not.toBe('rgba(0, 0, 0, 0)')
  expect(frame.background).toBe('rgba(0, 0, 0, 0)')

  // take the face under the crosshair: the blank level is a floor under the player, so the crosshair looks down on it
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the face is a quad of the level, and the widget shows its texture and its four corners
  await expect(mapper.locator('.corner')).toHaveCount(4)
  await expect(mapper.locator('.head .name')).toHaveText(/\.(?:bmp|jpg|png)$/iu)

  // every corner has its own number and colour, so four handles can be told apart
  await expect(mapper.locator('.corner .index')).toHaveText(['A', 'B', 'C', 'D'])

  const colours = await mapper.locator('.corner').evaluateAll((nodes) => {
    return nodes.map((node) => {
      return getComputedStyle(node).backgroundColor
    })
  })

  expect(new Set(colours).size).toBe(4)

  // the corner to edit is a list next to the fields, and the numbers of it are the two fields under the square
  const cornerSelect = mapper.locator('button[aria-label="Corner to edit"]')

  /**
   * Picks a corner from the list of the widget: the list is drawn by the widget (the items of a native select are
   * painted by the system on Firefox), so it is a click on the button and one on the item.
   *
   * @param index The corner to pick.
   */
  async function pickCorner(index: number): Promise<void> {
    await cornerSelect.click()
    await mapper.locator(`.corner-item[data-corner="${String(index)}"]`).click()
  }

  const uField = mapper.locator('input[aria-label="U of the corner"]')
  const vField = mapper.locator('input[aria-label="V of the corner"]')

  await expect(cornerSelect).toHaveText('A')

  // the pointer goes, so the mouse reaches the widget (the lock keeps it on the walkable view otherwise)
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })

  await cornerSelect.click()
  await expect(mapper.locator('.corner-item')).toHaveText(['A', 'B', 'C', 'D'])
  await cornerSelect.click()

  expect(await uField.inputValue()).toMatch(/^\d\.\d{3}$/u)

  // the list carries the colours of the handles (2026-11-09): the item of a corner is the colour of its handle, and the
  // select shows the colour of the corner it holds
  async function backgroundOf(element: Locator): Promise<string> {
    return await element.evaluate((node) => {
      return getComputedStyle(node).backgroundColor
    })
  }

  for (const index of [0, 1, 2, 3]) {
    const selector = String(index)
    const handle = mapper.locator(`.corner[data-corner="${selector}"]`)

    await cornerSelect.click()

    const item = mapper.locator(`.corner-item[data-corner="${selector}"]`)
    const handleColour = await backgroundOf(handle)
    const itemColour = await backgroundOf(item)

    expect(itemColour).toBe(handleColour)

    await item.click()

    const selectColour = await backgroundOf(cornerSelect)

    expect(selectColour).toBe(handleColour)
  }

  // the drag below works on the corner A, and the fields show the corner the list holds
  await pickCorner(0)

  const corner = mapper.locator('.corner[data-corner="0"]')
  const box = await corner.boundingBox()
  const uBeforeOfDrag = await uField.inputValue()

  expect(box).not.toBeNull()

  if (box === null) {
    return
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const centreX = box.x + halfWidth
  const centreY = box.y + halfHeight

  await page.mouse.move(centreX, centreY)
  await page.mouse.down()
  await page.mouse.move(centreX + 24, centreY + 16, { steps: 8 })
  await page.mouse.up()

  // the corner moved: the model, and the numbers under the square with it
  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .not.toBe(uBeforeOfDrag)

  // the step is one of the history: ctrl+z puts the corner back, and the face stays selected (a uv does not move the
  // indices of the level)
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe(uBeforeOfDrag)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the uv of a corner, as the two fields of it show it
  async function cornerUv(index: number): Promise<string> {
    await pickCorner(index)

    return `${await uField.inputValue()} ${await vField.inputValue()}`
  }

  // the wheel zooms the square, the way the fixed views zoom: the widget opens at 0.8 (the owner's request), and the
  // wheel takes it away from there. The wheel back puts it where it was, because the drags below are read in the pixels of
  // the square, and the blank level's face is the whole texture: a bigger square would push its corners out of the window
  await expect(mapper.locator('.head .zoom')).toHaveText('0.8×')
  await mapper.hover()
  await page.mouse.wheel(0, -300)
  await expect
    .poll(async () => {
      return await mapper.locator('.head .zoom').textContent()
    })
    .not.toBe('0.8×')
  await page.mouse.wheel(0, 300)
  await expect
    .poll(async () => {
      return await mapper.locator('.head .zoom').textContent()
    })
    .toBe('0.8×')
  await page.waitForTimeout(300)

  // the drag of the texture (not a corner, and not the yellow of the face) pans the whole view: the face slides with the
  // pointer, and the uv of the corner stays where it was
  const stage = mapper.locator('canvas')
  const stageBox = await stage.boundingBox()

  expect(stageBox).not.toBeNull()

  if (stageBox === null) {
    return
  }

  const cornerBefore = await corner.boundingBox()
  const uBeforePan = await cornerUv(0)

  // the corner of the square, where the repeat of the texture is and the face is not: the press there slides the view
  const panFromX = stageBox.x + 8
  const panFromY = stageBox.y + 8

  await page.mouse.move(panFromX, panFromY)
  await page.mouse.down()
  await page.mouse.move(panFromX + 40, panFromY + 25, { steps: 8 })
  await page.mouse.up()

  const cornerAfter = await corner.boundingBox()

  expect(cornerBefore).not.toBeNull()
  expect(cornerAfter).not.toBeNull()

  if (cornerBefore !== null && cornerAfter !== null) {
    expect(Math.round(cornerAfter.x - cornerBefore.x)).toBe(40)
    expect(Math.round(cornerAfter.y - cornerBefore.y)).toBe(25)
  }

  // and the uv of the corner is the one the undo left there: the pan moved the view, not the face
  expect(await cornerUv(0)).toBe(uBeforePan)

  await pickCorner(0)

  // the drag of the yellow (the whole face) is not exercised here: the face of the blank level fills its texture (uv 0..1),
  // and the widget keeps a face inside its texture, so there is nowhere to move it. The step of that drag is the same
  // `movedUvs` the unit tests of the widget cover.

  await pickCorner(0)

  // the list picks the corner to edit: the third one has its own uv, and the fields follow the choice
  const firstU = await uField.inputValue()
  const firstUV = `${firstU} ${await vField.inputValue()}`

  await pickCorner(2)

  // the corner 3 of this face has another v (the u of the two happens to be the same zero)
  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .not.toBe(firstUV)

  const thirdU = await uField.inputValue()
  const thirdV = await vField.inputValue()

  expect(thirdU).toMatch(/^\d\.\d{3}$/u)

  // the typing writes the corner the list shows, and the undo puts it back (one step for the two numbers)
  await uField.fill('0.25')
  await vField.fill('0.75')
  await page.keyboard.press('Enter')

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe('0.250')

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe(thirdU)

  await expect
    .poll(async () => {
      return await vField.inputValue()
    })
    .toBe(thirdV)

  // back to the first corner, the way the widget starts
  await pickCorner(0)

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe(firstU)

  // the two fields under the square are the numbers of the corner: they can be typed (or pasted), and the model follows
  expect(await uField.inputValue()).toMatch(/^\d\.\d{3}$/u)
  expect(await vField.inputValue()).toMatch(/^\d\.\d{3}$/u)

  const uBefore = await uField.inputValue()
  const vBefore = await vField.inputValue()

  // the middle of the texture: the corner goes there, and the handle follows
  const cornerBeforeFieldsBox = await corner.boundingBox()

  await uField.fill('0.5')
  await vField.fill('0.5')
  await page.keyboard.press('Enter')

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe('0.500')

  await expect
    .poll(async () => {
      return await vField.inputValue()
    })
    .toBe('0.500')

  // the handle follows the numbers: the corner of the model is the corner of the square (the view is centred on the
  // middle of the face, so the handle need not land on the middle of the square)
  const movedBox = await corner.boundingBox()
  const boxBeforeFields = cornerBeforeFieldsBox

  expect(movedBox).not.toBeNull()
  expect(boxBeforeFields).not.toBeNull()

  if (movedBox !== null && boxBeforeFields !== null) {
    expect(Math.abs(movedBox.x - boxBeforeFields.x)).toBeGreaterThan(10)
  }

  // the typing is one step of the history, and the undo puts the corner back (the fields follow it)
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toBe(uBefore)

  await expect
    .poll(async () => {
      return await vField.inputValue()
    })
    .toBe(vBefore)

  // the four turns lay the corners on other corners: the uv values stay, the corner takes another one's, and the step is
  // on the history
  const uBeforeTurn = await uField.inputValue()
  const vBeforeTurn = await vField.inputValue()

  await mapper.locator('button[aria-label="Rotate clockwise"]').click()

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .not.toBe(`${uBeforeTurn} ${vBeforeTurn}`)

  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .toBe(`${uBeforeTurn} ${vBeforeTurn}`)

  // the two buttons of a quad: the corners in a quarter of the texture, and over the whole of it
  const quarterButton = mapper.locator('button[aria-label="Lay the corners in a quarter of the texture"]')
  const maximizeButton = mapper.locator('button[aria-label="Stretch the corners to the whole texture"]')

  await expect(quarterButton).toBeEnabled()

  // a face that is not on a quarter jumps to the top left one: every corner of the field is a corner of that quarter
  await quarterButton.click()

  await expect
    .poll(async () => {
      return await uField.inputValue()
    })
    .toMatch(/^(?:0\.000|0\.500)$/u)

  // and every click takes the corners to the next quarter, clockwise: the corner 0 walks the quarters
  await quarterButton.click()

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .toBe('0.500 0.000')

  await quarterButton.click()
  await quarterButton.click()
  await quarterButton.click()

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .toBe('0.000 0.000')

  // the whole texture: the corner 4 takes the bottom right point of it
  await maximizeButton.click()
  await pickCorner(3)

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .toBe('1.000 1.000')

  await pickCorner(0)

  // with the shift held the corner goes along the four axes only: a drag up keeps the u and moves the v
  //
  // the corner goes to the middle of the face first: the undo of the fields put it back on the edge of the texture, where
  // the handle is half outside the square and a grab there would start the pan of the view instead
  await uField.fill('0.5')
  await vField.fill('0.5')
  await page.keyboard.press('Enter')
  await expect
    .poll(async () => {
      return await vField.inputValue()
    })
    .toBe('0.500')
  await page.waitForTimeout(300)

  const snapBox = await corner.boundingBox()
  const uBeforeSnap = await uField.inputValue()
  const vBeforeSnap = await vField.inputValue()

  expect(snapBox).not.toBeNull()

  if (snapBox !== null) {
    const halfSnapWidth = snapBox.width / 2
    const halfSnapHeight = snapBox.height / 2
    const snapX = snapBox.x + halfSnapWidth
    const snapY = snapBox.y + halfSnapHeight

    await page.mouse.move(snapX, snapY)
    await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.mouse.move(snapX + 10, snapY - 40, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.up('Shift')

    await expect
      .poll(async () => {
        return await uField.inputValue()
      })
      .toBe(uBeforeSnap)

    await expect
      .poll(async () => {
        return await vField.inputValue()
      })
      .not.toBe(vBeforeSnap)
  }

  // a double click takes the whole area of the face: those faces share the texture of the level, but not their uv, so the
  // widget refuses the selection and says which of the two differs
  await lockPointer(page, view)
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view, { clicks: 2 })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(1)

  await expect(mapper.locator('.hint')).toHaveText("Can't edit UV on selection: mismatching UV mapping")
  await expect(mapper.locator('.corner')).toHaveCount(0)
})

test('a selection of faces with other uv shows the texture, and the message in the place of the controls', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, uvLayout())
  await page.goto('/?map=blank-flat')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const mapper = page.locator('[data-widget-kind="uv-mapper"]')

  await expect(view).toBeVisible()
  await waitForLevel(page)
  await expect(mapper).toBeVisible()

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  await expect(mapper.locator('.corner')).toHaveCount(4)

  // the first face takes another uv, so the next face of the same texture can not share it
  const field = mapper.locator('input[aria-label="U of the corner"]')

  await field.fill('0.5')
  await field.blur()

  // the zoom of the edit is not the zoom of the selection that follows it: the wheel steps the view up first
  await mapper.locator('.stage').evaluate((stage) => {
    stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
  })

  await expect(mapper.locator('.head .zoom')).not.toHaveText('0.8×')

  // the camera steps aside, and a shift click adds the face under the crosshair: same texture, other uv
  await writePose(page, { ...spawn, x: String(Number(spawn.x) + 150), pitch: '60' })
  await clickCrosshair(view, { shift: true })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(2)

  // the corner frame and the controls are the tools of an edit: they go, and the message stands in their place
  await expect(mapper.locator('.hint')).toHaveText("Can't edit UV on selection: mismatching UV mapping")
  await expect(mapper.locator('.corner')).toHaveCount(0)
  await expect(mapper.locator('.turn')).toHaveCount(0)
  await expect(mapper.locator('.fields')).toHaveCount(0)

  // the texture the faces are painted with is still there: its name in the head, and the square of it on the stage
  await expect(mapper.locator('.head .name')).toHaveText(/\.(?:bmp|jpg|png)$/iu)
  await expect(mapper.locator('.square canvas')).toBeVisible()

  // and the view is back on the whole texture: the default zoom, from the middle of it
  await expect(mapper.locator('.head .zoom')).toHaveText('0.8×')
})

/**
 * A face whose texture the session has no file for says so under the square, without the tools of an edit.
 *
 * @remarks
 * Every level of the game opened without a data directory is that case: the level names the textures of the game, and
 * nothing decodes them. The widget shows no picture, so a collapsed face would only read as a dot in the middle, and the
 * controls would read as tools that work (the owner's screenshot of 2026-11-14). The line under the square says why the
 * square is empty, and the corners and the controls are not there.
 */
test('a face without a loaded texture says so under the square, without the corners and the controls', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, uvLayout())
  await page.goto('/?fromOriginalArxLevel=12')

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const mapper = page.locator('[data-widget-kind="uv-mapper"]')

  await expect(view).toBeVisible()
  await waitForLevel(page)
  await expect(mapper).toBeVisible()

  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, { ...spawn, pitch: '60' })
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the line is the one of the widget, in the place under the square where its other messages stand
  await expect(mapper.locator('.hint')).toHaveText('The texture of this face is not loaded.')
  // and the stage is only the frame of the place: no collapsed corners, no controls of an edit
  await expect(mapper.locator('.corner')).toHaveCount(0)
  await expect(mapper.locator('.fields')).toHaveCount(0)
  await expect(mapper.locator('.square')).toBeVisible()
  await expect(mapper.locator('.square canvas')).toHaveCount(0)
})
