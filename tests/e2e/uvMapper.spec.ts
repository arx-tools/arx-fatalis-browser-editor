import { expect, test } from '@playwright/test'
import {
  clickCrosshair,
  editorUrl,
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
 * The level comes over the network (see the note in the spec of the deletion), and the face is taken with the click of
 * the selection spec (the events are dispatched by the page, because a pointer lock turns every real mouse event into a
 * movement). The **drag of a corner** is a real one: the pointer is let go first, so the mouse reaches the corner of the
 * widget and not the canvas of the locked view.
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
  await page.goto(editorUrl())

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(view).toBeVisible()
  await waitForLevel(page)

  const mapper = page.locator('[data-widget-kind="uv-mapper"]')

  await expect(mapper).toBeVisible()

  // without a selection there is no face to edit, and the widget says so
  await expect(mapper.locator('.hint')).toHaveText('Select one face to edit its texture coordinates.')
  await expect(mapper.locator('.corner')).toHaveCount(0)

  // take the face under the crosshair
  const spawn = await readPose(page)

  await lockPointer(page, view)
  await writePose(page, spawn)
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
  await expect(mapper.locator('.corner .index')).toHaveText(['1', '2', '3', '4'])

  const colours = await mapper.locator('.corner').evaluateAll((nodes) => {
    return nodes.map((node) => {
      return getComputedStyle(node).backgroundColor
    })
  })

  expect(new Set(colours).size).toBe(4)

  // the corner to edit is a list next to the fields, and the numbers of it are the two fields under the square
  const cornerSelect = mapper.locator('select[aria-label="Corner to edit"]')
  const uField = mapper.locator('input[aria-label="U of the corner"]')
  const vField = mapper.locator('input[aria-label="V of the corner"]')

  await expect(cornerSelect.locator('option')).toHaveText(['Corner 1', 'Corner 2', 'Corner 3', 'Corner 4'])
  expect(await cornerSelect.inputValue()).toBe('0')
  expect(await uField.inputValue()).toMatch(/^\d\.\d{3}$/u)

  // the pointer goes, so the mouse reaches the corner of the widget
  await page.evaluate(() => {
    globalThis.document.exitPointerLock()
  })

  const corner = mapper.locator('[data-corner="0"]')
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

  // the wheel zooms the square, the way the fixed views zoom: the widget opens at 0.8 (the owner's request), and the
  // wheel takes it away from there
  await expect(mapper.locator('.head .zoom')).toHaveText('0.8×')
  await mapper.hover()
  await page.mouse.wheel(0, -300)
  await expect
    .poll(async () => {
      return await mapper.locator('.head .zoom').textContent()
    })
    .not.toBe('0.8×')

  // the uv of a corner, as the two fields of it show it
  async function cornerUv(index: number): Promise<string> {
    await cornerSelect.selectOption(String(index))

    return `${await uField.inputValue()} ${await vField.inputValue()}`
  }

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

  await cornerSelect.selectOption('0')

  // the yellow of the face moves the whole face: every corner takes the same step, so the shape of the face stays
  const middleOfFace = await mapper.locator('.corner').evaluateAll((nodes) => {
    const boxes = nodes.map((node) => {
      return node.getBoundingClientRect()
    })

    return {
      x:
        boxes.reduce((sum, box) => {
          return sum + box.x
        }, 0) / boxes.length,
      y:
        boxes.reduce((sum, box) => {
          return sum + box.y
        }, 0) / boxes.length,
    }
  })
  const firstBefore = await cornerUv(0)
  const lastBefore = await cornerUv(3)

  await page.mouse.move(middleOfFace.x, middleOfFace.y)
  await page.mouse.down()
  await page.mouse.move(middleOfFace.x + 24, middleOfFace.y + 12, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  const firstAfter = await cornerUv(0)
  const lastAfter = await cornerUv(3)

  // the step is the same for both corners: the numbers of the two moved by the same amount
  function stepOf(before: string, after: string): number[] {
    const [beforeU = '', beforeV = ''] = before.split(' ', 2)
    const [afterU = '', afterV = ''] = after.split(' ', 2)

    return [Number(afterU) - Number(beforeU), Number(afterV) - Number(beforeV)]
  }

  const firstStep = stepOf(firstBefore, firstAfter)
  const lastStep = stepOf(lastBefore, lastAfter)

  expect(firstStep[0]).toBeCloseTo(lastStep[0] ?? 0, 2)
  expect(firstStep[1]).toBeCloseTo(lastStep[1] ?? 0, 2)
  expect(Math.abs(firstStep[0] ?? 0) + Math.abs(firstStep[1] ?? 0)).toBeGreaterThan(0.01)

  // one press is one step of the history
  await page.keyboard.press('Control+z')

  await expect
    .poll(async () => {
      return await cornerUv(0)
    })
    .toBe(firstBefore)

  await expect
    .poll(async () => {
      return await cornerUv(3)
    })
    .toBe(lastBefore)

  await cornerSelect.selectOption('0')

  // the list picks the corner to edit: the third one has its own uv, and the fields follow the choice
  const firstU = await uField.inputValue()
  const firstUV = `${firstU} ${await vField.inputValue()}`

  await cornerSelect.selectOption('2')

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
  await cornerSelect.selectOption('0')

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
  await cornerSelect.selectOption('3')

  await expect
    .poll(async () => {
      return `${await uField.inputValue()} ${await vField.inputValue()}`
    })
    .toBe('1.000 1.000')

  await cornerSelect.selectOption('0')

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
  await writePose(page, spawn)
  await clickCrosshair(view, { clicks: 2 })

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(1)

  await expect(mapper.locator('.hint')).toHaveText("Can't edit UV on selection: mismatching UV mapping")
  await expect(mapper.locator('.corner')).toHaveCount(0)
})
