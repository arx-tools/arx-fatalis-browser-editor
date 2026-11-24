import type { Buffer } from 'node:buffer'
import { expect, test, type Locator, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { exportLevelFiles } from '../../src/editor/modules/export/exportLevel.ts'
import { testLayout } from '../support/layouts.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { Settings } from '../../src/generator/Settings.ts'
import {
  clickCrosshair,
  lockPointer,
  openZip,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The pose the camera of the test takes: it looks at the middle of the face of the pit.
 *
 * @remarks
 * A zip without a stored pose opens on its spawn, so the test writes this one into the camera form. The pose is the
 * owner's archive pose, turned a little to put the face in the middle of the crosshair: the walkable view reads the
 * face under the crosshair, and the gizmo stands on the middle of the selection.
 */
const CAMERA_POSE = { x: '715.68', y: '-389.28', z: '628.50', pitch: '55.62', yaw: '153.15', roll: '0.00' }

/**
 * Where the green arrow of the Y axis is on the canvas, and how far the drag goes.
 *
 * @remarks
 * The game's Y looks down, and the arrow of the gizmo on the upper side is the negative end of it: dragging it
 * **toward** the middle moves the face down the level, toward the floor of the pit. The arrow is not in the DOM, so
 * the test presses its pixels; the drag ends five units above the pit, inside the twelve pixel threshold.
 */
const ARROW_AT = { x: 456, y: 332 }
const DRAG_PIXELS = { x: 0, y: 8 }

/**
 * The face of the map this test is about: the fourth face of a 2x2 hole, raised above its middle.
 *
 * @remarks
 * The owner's map was a flat level with a 2x2 hole. This one puts the fourth face in the middle of the hole and lifts it
 * 15 units out of the floor (the game's Y looks down, so -15 is above it), and a floor five units below the level is
 * under the hole: the face floats twenty units above it.
 */
const FACE_OFFSET = { x: -50, y: -15, z: -50 }

/**
 * The height of the face in the level, and the floor it lands on.
 */
const FACE_Y = -15
const PIT_Y = 5

/**
 * Tells whether the box of a polygon is a cell of the flat level.
 *
 * @param map The level to read.
 * @param x The left edge of the cell.
 * @param z The near edge of the cell.
 *
 * @returns The index of the face.
 *
 * @throws When the blank level has no face with that box.
 */
function cellIndex(map: ArxMap, x: number, z: number): number {
  const index = map.polygons.findIndex((polygon) => {
    const xs = polygon.vertices.map((vertex) => {
      return vertex.x
    })
    const zs = polygon.vertices.map((vertex) => {
      return vertex.z
    })

    return Math.min(...xs) === x && Math.max(...xs) === x + 100 && Math.min(...zs) === z && Math.max(...zs) === z + 100
  })

  if (index === -1) {
    throw new Error(`the blank level has no face at the cell ${String(x)}, ${String(z)}`)
  }

  return index
}

/**
 * Builds the map of the test in memory: a 2x2 hole, a face floating above its middle, and a floor under it.
 *
 * @remarks
 * The level is the blank flat preset of the editor, so the test needs no fixture and no game data. Three faces of the
 * 2x2 block are deleted, the fourth is moved into the middle of the hole and lifted, and a floor is put under the hole
 * five units below the level (a pit). The face has no edge or vertex of the level near it, so the plane snap is the one
 * the drag can use.
 *
 * @returns The zip, ready for the file picker.
 */
async function zipOfThePit(): Promise<Buffer> {
  const files = createBlankLevelFiles(FLAT_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const hole = [cellIndex(map, 500, 300), cellIndex(map, 600, 300), cellIndex(map, 500, 400)]

  map.polygons.delete(hole)

  const raised = cellIndex(map, 600, 400)

  map.polygons.translate([raised], FACE_OFFSET)

  const source = map.polygons[raised]

  if (source === undefined) {
    throw new Error('the blank level lost the face of the hole')
  }

  const pit = structuredClone(source)

  pit.vertices = [
    { x: 500, y: PIT_Y, z: 300, u: 0, v: 0, llfColorIdx: 0 },
    { x: 700, y: PIT_Y, z: 300, u: 1, v: 0, llfColorIdx: 1 },
    { x: 500, y: PIT_Y, z: 500, u: 0, v: 1, llfColorIdx: 2 },
    { x: 700, y: PIT_Y, z: 500, u: 1, v: 1, llfColorIdx: 3 },
  ]
  pit.area = 40_000

  // the export writes the visible faces of the level, and the new floor goes on that list
  map.visiblePolygons = [...map.visiblePolygons, pit]

  const level = 'level1'
  const output = exportLevelFiles(map)
  const archive = new JSZip()

  archive.file(`game/graph/levels/${level}/fast.fts`, new Uint8Array(output.fts))
  archive.file(`graph/levels/${level}/${level}.dlf`, new Uint8Array(output.dlf))
  archive.file(`graph/levels/${level}/${level}.llf`, new Uint8Array(output.llf))
  archive.file(
    'editor/settings.json',
    JSON.stringify({
      camera: { position: [715.68, -389.28, 628.5], rotation: [55.62, 153.15, 0] },
    }),
  )
  archive.file(
    'manifest.json',
    JSON.stringify({
      name: 'Plane snap',
      version: '1.0.0',
      files: [
        `game/graph/levels/${level}/fast.fts`,
        `graph/levels/${level}/${level}.dlf`,
        `graph/levels/${level}/${level}.llf`,
      ],
    }),
  )

  return await archive.generateAsync({ type: 'nodebuffer' })
}

/**
 * The last step of the history of the map the picker opened.
 *
 * @param page The page to read.
 *
 * @returns The step, or `undefined` while the history has nothing on it.
 */
async function lastStepOf(page: Page): Promise<
  | {
      readonly kind: string
      readonly delta?: { readonly x: number; readonly y: number; readonly z: number }
    }
  | undefined
> {
  return await page.evaluate(() => {
    const raw = localStorage.getItem('mapHistory:custom:0')

    if (raw === null) {
      return undefined
    }

    const history = JSON.parse(raw) as { records?: unknown[] }

    return history.records?.at(-1) as { kind: string } | undefined
  })
}

/**
 * Opens the map of the pit, and gives the canvas of the view with its box.
 *
 * @param page The page to drive.
 *
 * @returns The canvas and its box.
 */
async function openThePit(page: Page): Promise<{
  readonly view: Locator
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}> {
  await seedLayout(page, testLayout)
  await page.goto('/')
  await waitForLevel(page)

  await openZip(page, 'plane-snap.zip', await zipOfThePit())

  // the blank level has 121 faces; three of the hole are gone and the floor of the pit is new
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(119)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const box = await view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  return { view, box }
}

/**
 * Aims the camera of the view at the face of the pit and selects it, then lets the pointer go.
 *
 * @param page The page to drive.
 * @param view The canvas of the walkable view.
 */
async function aimThePit(page: Page, view: Locator): Promise<void> {
  // the pointer lock comes from a real click, and that click turns the camera: the form writes the pose back
  await lockPointer(page, view)
  await writePose(page, CAMERA_POSE)
  await clickCrosshair(view)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(1)

  // the gizmo is drawn while the camera holds the pointer, but it can not be grabbed: let the pointer go
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
}

/**
 * The last step of the history as a move, once the drag has left it there.
 *
 * @param page The page to read.
 *
 * @returns The step.
 */
async function lastMoveOf(
  page: Page,
): Promise<{ readonly delta: { readonly x: number; readonly y: number; readonly z: number } }> {
  await expect
    .poll(async () => {
      return await lastStepOf(page)
    })
    .toMatchObject({ kind: 'translateFaces' })

  const step = await lastStepOf(page)

  if (step?.delta === undefined) {
    throw new Error('the drag left no step of a move in the history')
  }

  return { delta: step.delta }
}

/**
 * The plane snap lowers the face of the hole onto the floor of the pit under it.
 *
 * @remarks
 * This is S3 of the snapping round: a corner of the selection lands on the plane of a face of the level along the axis
 * of the drag. The face floats twenty units above the pit, and the drag of the Y arrow moves it five units down: the
 * edge rail and the vertex snap have nothing near, so the plane snap is what closes the gap, and the history holds it.
 *
 * The step of the history carries the snapped offset: the face started at FACE_Y, so a step of `PIT_Y - FACE_Y` lands
 * it on the floor of the pit.
 */
test('the plane snap lands the face of the hole on the floor of the pit', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  const { view, box } = await openThePit(page)

  await aimThePit(page, view)

  const magnet = page.locator('[data-widget-kind="3d-view"] .snap-toggle')

  await magnet.click()
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')

  // the upper end of the Y axis points up the level: the drag toward the middle goes down it, to the pit
  await page.mouse.move(box.x + ARROW_AT.x, box.y + ARROW_AT.y)
  await page.mouse.down()
  await page.mouse.move(box.x + ARROW_AT.x + DRAG_PIXELS.x, box.y + ARROW_AT.y + DRAG_PIXELS.y, { steps: 6 })
  await page.mouse.up()

  const { delta } = await lastMoveOf(page)

  // the face was FACE_Y above the level, and the plane of the pit is PIT_Y: the snap takes the whole difference
  expect(delta.y).toBeCloseTo(PIT_Y - FACE_Y, 6)
  expect(Math.abs(delta.x)).toBeLessThan(1e-9)
  expect(Math.abs(delta.z)).toBeLessThan(1e-9)
})

/**
 * The plane snap lets go when the drag passes the plane, instead of holding the face on it.
 *
 * @remarks
 * The snap is there to bring the face to the plane the author drags it to; once the face is past the plane, the
 * correction would point back and the snap would fight the drag (the owner: the face stayed on the floor while the
 * pointer kept going). The drag here goes well past the floor of the pit: the face has to follow it.
 */
test('the plane snap lets the face pass the plane when the drag goes past it', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  const { view, box } = await openThePit(page)

  await aimThePit(page, view)

  const magnet = page.locator('[data-widget-kind="3d-view"] .snap-toggle')

  await magnet.click()
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')

  // the drag is four times as long as the one of the first test: the raw move is well past the floor of the pit
  const offsetX = DRAG_PIXELS.x * 4
  const offsetY = DRAG_PIXELS.y * 4
  const end = { x: box.x + ARROW_AT.x + offsetX, y: box.y + ARROW_AT.y + offsetY }

  await page.mouse.move(box.x + ARROW_AT.x, box.y + ARROW_AT.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()

  const { delta } = await lastMoveOf(page)

  // the face started FACE_Y above the level: a step past PIT_Y - FACE_Y means the plane did not hold it
  expect(delta.y).toBeGreaterThan(PIT_Y - FACE_Y + 10)
  expect(Math.abs(delta.x)).toBeLessThan(1e-9)
  expect(Math.abs(delta.z)).toBeLessThan(1e-9)
})

/**
 * The plane snap works when Shift comes in the middle of a drag, not only from the first frame.
 *
 * @remarks
 * The snaps are built on the first frame that needs them, so a drag that starts without the magnet builds them after
 * the face has already moved. The snaps read the corners of the level as it stands at the build, and the drag has to
 * take that move out of the translation: otherwise the face snaps beside the plane (the case of 2026-11-21, the owner:
 * the snap point wandered below the plane).
 */
test('the plane snap finds the plane when Shift comes in the middle of the drag', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  const { view, box } = await openThePit(page)

  await aimThePit(page, view)

  // the lock change reaches the gizmo a tick after the pointer is free (the other tests of the gizmo wait this long too)
  await page.waitForTimeout(500)

  // the magnet stays off: the snaps are built when Shift is pressed, halfway down the drag
  const start = { x: box.x + ARROW_AT.x, y: box.y + ARROW_AT.y }

  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x, start.y + 4, { steps: 3 })
  await page.keyboard.down('Shift')
  await page.mouse.move(start.x, start.y + 8, { steps: 3 })
  await page.mouse.up()
  await page.keyboard.up('Shift')

  const { delta } = await lastMoveOf(page)

  expect(delta.y).toBeCloseTo(PIT_Y - FACE_Y, 6)
  expect(Math.abs(delta.x)).toBeLessThan(1e-9)
  expect(Math.abs(delta.z)).toBeLessThan(1e-9)
})
