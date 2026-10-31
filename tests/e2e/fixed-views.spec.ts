import { expect, test, type Locator, type Page } from '@playwright/test'
import type { LayoutNode } from '../../src/editor/modules/layout/layoutNode.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import { seedLayout, waitForLevel } from './support/editor.ts'

/**
 * The six directions of the fixed views.
 */
const VIEWS = [
  WIDGET_KINDS.topView,
  WIDGET_KINDS.bottomView,
  WIDGET_KINDS.frontView,
  WIDGET_KINDS.backView,
  WIDGET_KINDS.leftView,
  WIDGET_KINDS.rightView,
]

/**
 * The layout the test starts with: the walkable view (the fixed views move its camera), the statistics (the
 * level is on when it shows the numbers) and the jump, and the six fixed views in a grid of two columns.
 *
 * @remarks
 * The dock is proportional, so every fixed view gets the same share of the window: a click lands inside one of
 * them, and an assertion about where the marker sits means the same thing in every view.
 */
const fixedViewsLayout: LayoutNode = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [0.5, 0.5],
  children: [
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [0.6, 0.2, 0.2],
      children: [
        { type: 'widget', kind: WIDGET_KINDS.view3d },
        { type: 'widget', kind: WIDGET_KINDS.mapStatistics },
        { type: 'widget', kind: WIDGET_KINDS.jumpToLocation },
      ],
    },
    {
      type: 'split',
      orientation: 'vertical',
      sizes: [1 / 3, 1 / 3, 1 / 3],
      children: [
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'widget', kind: WIDGET_KINDS.topView },
            { type: 'widget', kind: WIDGET_KINDS.bottomView },
          ],
        },
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'widget', kind: WIDGET_KINDS.frontView },
            { type: 'widget', kind: WIDGET_KINDS.backView },
          ],
        },
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'widget', kind: WIDGET_KINDS.leftView },
            { type: 'widget', kind: WIDGET_KINDS.rightView },
          ],
        },
      ],
    },
  ],
}

/**
 * A point of the page.
 */
interface Point {
  /**
   * The distance from the left edge.
   */
  readonly x: number
  /**
   * The distance from the top edge.
   */
  readonly y: number
}

/**
 * The widget of one fixed view.
 *
 * @param page The page to read.
 * @param kind Which direction the view shows.
 *
 * @returns The node of the widget in the dock.
 */
function viewOf(page: Page, kind: string): Locator {
  return page.locator(`.lm-DockPanel-widget[data-widget-kind="${kind}"]`)
}

/**
 * The canvas of one fixed view.
 *
 * @param page The page to read.
 * @param kind Which direction the view shows.
 *
 * @returns The element the pointer goes to.
 */
function canvasOf(page: Page, kind: string): Locator {
  return viewOf(page, kind).locator('canvas.stage')
}

/**
 * The zoom the view writes into its corner.
 *
 * @param page The page to read.
 * @param kind Which direction the view shows.
 *
 * @returns The zoom as a number, read from the label (`2.1×` gives `2.1`).
 */
async function zoomOf(page: Page, kind: string): Promise<number> {
  const text = await viewOf(page, kind).locator('.zoom').textContent()

  return Number((text ?? '0').replace('×', ''))
}

/**
 * The centre of the camera marker of a view.
 *
 * @param page The page to read.
 * @param kind Which direction the view shows.
 *
 * @returns The centre in the pixels of the page, or `undefined` while the marker is not shown.
 */
async function markerCentreOf(page: Page, kind: string): Promise<Point | undefined> {
  const mark = viewOf(page, kind).locator('.camera-mark')

  // the marker is an `svg` that is not in the document when there is nothing to mark (a pose, a level)
  if ((await mark.count()) === 0) {
    return undefined
  }

  const box = await mark.boundingBox()

  if (box === null) {
    return undefined
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  return { x: box.x + halfWidth, y: box.y + halfHeight }
}

/**
 * The position the url carries: the camera writes its pose there, throttled.
 *
 * @param page The page to read.
 *
 * @returns The three numbers of the position, or an empty list before the first write.
 */
function positionOf(page: Page): number[] {
  const value = new URL(page.url()).searchParams.get('position') ?? ''

  if (value === '') {
    return []
  }

  return value.split(',').map(Number)
}

/**
 * Waits until the url carries another position than the one in the argument.
 *
 * @param page The page to watch.
 * @param before The position the camera had.
 */
async function expectPositionChange(page: Page, before: readonly number[]): Promise<void> {
  await expect
    .poll(
      () => {
        return positionOf(page)
      },
      { timeout: 5000 },
    )
    .not.toEqual(before)
}

/**
 * A point of the canvas, given as a share of its size.
 *
 * @param canvas The canvas to read.
 * @param alongX Where the point is, from the left edge (0..1).
 * @param alongY Where the point is, from the top edge (0..1).
 *
 * @returns The point in the pixels of the page.
 */
async function pointOf(canvas: Locator, alongX: number, alongY: number): Promise<Point> {
  const box = await canvas.boundingBox()

  if (box === null) {
    throw new Error('the canvas has no box')
  }

  const x = box.width * alongX
  const y = box.height * alongY

  return { x: box.x + x, y: box.y + y }
}

/**
 * The centre of a canvas.
 *
 * @param canvas The canvas to read.
 *
 * @returns The centre in the pixels of the page.
 */
async function centreOf(canvas: Locator): Promise<Point> {
  return await pointOf(canvas, 0.5, 0.5)
}

/**
 * Zooms a view with the wheel of the pointer.
 *
 * @param page The page to turn the wheel on.
 * @param kind Which direction the view shows.
 * @param steps How many units the wheel turns: negative turns the zoom up, positive down.
 */
async function wheel(page: Page, kind: string, steps: number): Promise<void> {
  const centre = await centreOf(canvasOf(page, kind))

  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, steps)
  await page.waitForTimeout(200)
}

/**
 * Opens the page on the layout of the six views, with the level on.
 *
 * @param page The page to prepare.
 */
async function openTheViews(page: Page): Promise<void> {
  test.setTimeout(120_000)

  await seedLayout(page, fixedViewsLayout)
  await page.goto('/')
  await waitForLevel(page)

  // the fixed views need the level and a pose: the marker of the top view is the sign of both
  await expect
    .poll(
      async () => {
        return await markerCentreOf(page, WIDGET_KINDS.topView)
      },
      { timeout: 10_000 },
    )
    .not.toBeUndefined()
}

test('the six views zoom with the wheel, and come back to the framed view', async ({ page }) => {
  await openTheViews(page)

  for (const kind of VIEWS) {
    expect(await zoomOf(page, kind)).toBe(1)

    await wheel(page, kind, -500)

    const zoomed = await zoomOf(page, kind)

    expect(zoomed).toBeGreaterThan(1.5)
    expect(zoomed).toBeLessThanOrEqual(20)

    // the wheel back is the inverse of the wheel in, and the clamp holds the framed view at 1
    await wheel(page, kind, 500)

    expect(await zoomOf(page, kind)).toBe(1)

    await wheel(page, kind, 5000)

    expect(await zoomOf(page, kind)).toBe(1)
  }
})

test('a click at the framed view puts the marker under the pointer, and moves the camera', async ({ page }) => {
  await openTheViews(page)

  for (const kind of VIEWS) {
    const before = positionOf(page)
    const point = await pointOf(canvasOf(page, kind), 0.4, 0.45)

    await page.mouse.click(point.x, point.y)
    await expectPositionChange(page, before)

    const marker = await markerCentreOf(page, kind)

    // the pointer is read on the plane of the walkable camera, so the marker lands where the pointer is
    expect(Math.abs((marker?.x ?? 0) - point.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((marker?.y ?? 0) - point.y)).toBeLessThanOrEqual(2)
  }
})

test('a click outside the level moves the camera too', async ({ page }) => {
  await openTheViews(page)

  for (const kind of [WIDGET_KINDS.topView, WIDGET_KINDS.leftView]) {
    const before = positionOf(page)
    const point = await pointOf(canvasOf(page, kind), 0.08, 0.08)

    await page.mouse.click(point.x, point.y)
    await expectPositionChange(page, before)

    const marker = await markerCentreOf(page, kind)

    // the plane of the view has no end: the corner of the canvas is a place as well, and the marker is there
    expect(Math.abs((marker?.x ?? 0) - point.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((marker?.y ?? 0) - point.y)).toBeLessThanOrEqual(2)
  }
})

test('a drag at the framed view follows the pointer, and the mapping is linear', async ({ page }) => {
  await openTheViews(page)

  const canvas = canvasOf(page, WIDGET_KINDS.topView)
  const start = await pointOf(canvas, 0.3, 0.4)
  const middle = await pointOf(canvas, 0.4, 0.4)
  const end = await pointOf(canvas, 0.5, 0.4)

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.waitForTimeout(300)

  const pressed = positionOf(page)

  await page.mouse.move(middle.x, middle.y, { steps: 5 })
  await page.waitForTimeout(300)

  const atMiddle = positionOf(page)
  const atMiddleMarker = await markerCentreOf(page, WIDGET_KINDS.topView)

  await page.mouse.move(end.x, end.y, { steps: 5 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  const atEnd = positionOf(page)
  const atEndMarker = await markerCentreOf(page, WIDGET_KINDS.topView)

  // the pointer follows the drag: the marker is where the pointer is, without a raycast in the way
  expect(Math.abs((atMiddleMarker?.x ?? 0) - middle.x)).toBeLessThanOrEqual(2)
  expect(Math.abs((atEndMarker?.x ?? 0) - end.x)).toBeLessThanOrEqual(2)

  // the drag is the 2D offset on the plane, so the same pixel distance is the same world distance: the
  // position at the middle sits halfway between the press and the end (within a tenth of the whole move)
  for (const axis of [0, 1, 2]) {
    const from = pressed[axis] ?? 0
    const to = atEnd[axis] ?? 0
    const reached = atMiddle[axis] ?? 0
    const halfway = (from + to) / 2
    const whole = Math.abs(to - from)

    // a plan view keeps the height (the depth axis of the direction): that axis does not move, and there is
    // nothing to be halfway on
    if (whole === 0) {
      continue
    }

    expect(Math.abs(reached - halfway)).toBeLessThan(whole / 10)
  }
})

test('a click lands under the pointer in a landscape and in a portrait view', async ({ page }) => {
  await openTheViews(page)

  // the aspect ratio of a widget changes with the dock, and the framing of a direction depends on it: the
  // mapping from the pixel to the plane of the camera has to hold in both shapes
  for (const size of [
    { width: 1631, height: 850 },
    { width: 900, height: 1100 },
  ]) {
    await page.setViewportSize(size)
    await page.waitForTimeout(600)

    const before = positionOf(page)
    const point = await pointOf(canvasOf(page, WIDGET_KINDS.leftView), 0.35, 0.6)

    await page.mouse.click(point.x, point.y)
    await expectPositionChange(page, before)

    const marker = await markerCentreOf(page, WIDGET_KINDS.leftView)

    expect(Math.abs((marker?.x ?? 0) - point.x)).toBeLessThanOrEqual(2)
    expect(Math.abs((marker?.y ?? 0) - point.y)).toBeLessThanOrEqual(2)
  }
})

test('the jump moves the marker in the views', async ({ page }) => {
  await openTheViews(page)

  const spawnMarker = await markerCentreOf(page, WIDGET_KINDS.topView)
  const point = await pointOf(canvasOf(page, WIDGET_KINDS.topView), 0.3, 0.6)

  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(500)

  const clickedMarker = await markerCentreOf(page, WIDGET_KINDS.topView)

  expect(clickedMarker).toBeDefined()
  expect(Math.abs((clickedMarker?.x ?? 0) - point.x)).toBeLessThanOrEqual(2)

  // the jump puts the camera back on the spawn: the marker follows the pose into every view
  await page.locator('[data-widget-kind="jump-to-location"] button').click()
  await page.waitForTimeout(700)

  const backMarker = await markerCentreOf(page, WIDGET_KINDS.topView)

  expect(backMarker).toBeDefined()
  expect(Math.abs((backMarker?.x ?? 0) - (spawnMarker?.x ?? 0))).toBeLessThanOrEqual(2)
  expect(Math.abs((backMarker?.y ?? 0) - (spawnMarker?.y ?? 0))).toBeLessThanOrEqual(2)
})

test('a zoomed view is a magnifier: the click moves the camera, and the marker stays in the middle', async ({
  page,
}) => {
  await openTheViews(page)

  await wheel(page, WIDGET_KINDS.topView, -1200)

  expect(await zoomOf(page, WIDGET_KINDS.topView)).toBeGreaterThan(3)

  const canvas = canvasOf(page, WIDGET_KINDS.topView)
  const centre = await centreOf(canvas)
  const before = positionOf(page)
  const point = await pointOf(canvas, 0.3, 0.35)

  await page.mouse.click(point.x, point.y)
  await expectPositionChange(page, before)

  // the zoomed view is framed again around the camera: the marker lands in the middle of the canvas
  const marker = await markerCentreOf(page, WIDGET_KINDS.topView)

  expect(Math.abs((marker?.x ?? 0) - centre.x)).toBeLessThanOrEqual(2)
  expect(Math.abs((marker?.y ?? 0) - centre.y)).toBeLessThanOrEqual(2)

  // the click still goes somewhere: the canvas keeps the crosshair, framed or zoomed
  const cursor = await canvas.evaluate((element) => {
    return getComputedStyle(element).cursor
  })

  expect(cursor).toBe('crosshair')
})

test('a zoomed view does not drag, and a jump re-frames it', async ({ page }) => {
  await openTheViews(page)

  const canvas = canvasOf(page, WIDGET_KINDS.topView)

  await wheel(page, WIDGET_KINDS.topView, -1200)

  const start = await pointOf(canvas, 0.4, 0.4)

  // the press of a zoomed view still jumps (a click works framed and zoomed), so the position after the press
  // is the one the moves must leave alone: the drag is the move of the framed view only, because zoomed in every
  // move would reframe the view and chase its own tail
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.waitForTimeout(400)

  const before = positionOf(page)

  await page.mouse.move(start.x + 60, start.y + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(500)

  expect(positionOf(page)).toEqual(before)

  const centre = await centreOf(canvas)
  const marker = await markerCentreOf(page, WIDGET_KINDS.topView)

  expect(Math.abs((marker?.x ?? 0) - centre.x)).toBeLessThanOrEqual(2)
  expect(Math.abs((marker?.y ?? 0) - centre.y)).toBeLessThanOrEqual(2)

  // a jump moves the camera, and the zoomed view follows it: the picture of the level changes, and the marker
  // stays in the middle (this is what makes a zoomed view a magnifier of the camera, not of the level)
  const pictureBefore = await canvas.screenshot()

  await page.locator('[data-widget-kind="jump-to-location"] button').click()
  await page.waitForTimeout(800)

  const pictureAfter = await canvas.screenshot()

  expect(pictureAfter.equals(pictureBefore)).toBe(false)

  const movedMarker = await markerCentreOf(page, WIDGET_KINDS.topView)

  expect(Math.abs((movedMarker?.x ?? 0) - centre.x)).toBeLessThanOrEqual(2)
  expect(Math.abs((movedMarker?.y ?? 0) - centre.y)).toBeLessThanOrEqual(2)
})
