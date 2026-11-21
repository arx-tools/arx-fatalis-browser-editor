import type { Buffer } from 'node:buffer'
import { expect, test, type Locator, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { createBlankLevelFiles, FLAT_PRESET } from '../../src/editor/modules/level/blankLevel.ts'
import { exportLevelFiles } from '../../src/editor/modules/export/exportLevel.ts'
import { editorLayout } from '../../src/editor/modules/layout/layoutPresets.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { Settings } from '../../src/generator/Settings.ts'
import {
  lockPointer,
  nextFrames,
  openZip,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The pose the owner framed the hole with when the map was exported.
 *
 * @remarks
 * The face in the hole sits at the crosshair of this pose (see {@link SELECT_AT} and {@link ARROW_AT}), and the camera
 * of a zip that has no stored pose starts on the spawn: the test writes this one into the camera form, the way a hand
 * would.
 */
const CAMERA_POSE = { x: '715.68', y: '-389.28', z: '628.50', pitch: '54.30', yaw: '166.24', roll: '0.00' }

/**
 * Where the middle of the face in the hole is on the canvas of the view, in pixels.
 *
 * @remarks
 * The pose above puts it there (913x765 canvas, the `Editor` layout of the suite): a 3D gizmo is not in the DOM, so a
 * test presses its pixels. The same numbers are the middle of the selection, where the translate gizmo stands.
 */
const SELECT_AT = { x: 481, y: 423 }

/**
 * Where the red arrow of the X axis is on the canvas, and how far the drag goes along it.
 *
 * @remarks
 * The arrow is the game's X: the drag moves the face towards the hole edge that stands 12.068 units to its right. Nine
 * pixels are about eight units, so the raw end of the drag is 4 units short of the edge, inside the 12 pixel threshold:
 * the edge rail is expected to pull the face onto the edge exactly.
 */
const ARROW_AT = { x: 394.68, y: 440.6 }
const DRAG_PIXELS = { x: -8.82, y: 1.79 }

/**
 * The face of the map this test is about: the cell (600, 400) of the blank flat level, moved into the hole.
 *
 * @remarks
 * The owner's map was a flat level with three faces deleted in an L, and the fourth face of the 2x2 hole moved out of
 * its cell: its right edge stopped about 12 units short of the hole edge at x = 700. That is the position the drag
 * below starts from, and the one the snap has to take to 700.
 */
const FACE_OFFSET = { x: -12, y: 0, z: -44 }

/**
 * The edge of the hole the face is dragged onto, in the coordinates of the level.
 */
const HOLE_EDGE_X = 700

/**
 * The right edge of the moved face in the level of the map.
 */
const FACE_EDGE_X = 688

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
 * Builds the map of the owner, in memory: a flat level with a 2x2 hole and the fourth face of it inside.
 *
 * @remarks
 * The level is the blank flat preset of the editor, so the test needs no fixture and no game data: three faces of a
 * 2x2 block are deleted, and the fourth is moved 12.068 units from the edge of the hole, which is the place the owner
 * exported. The zip is the shape the header opens (the three files under the paths of an installation and a
 * manifest).
 *
 * @returns The zip, ready for the file picker.
 */
async function zipOfTheHole(): Promise<Buffer> {
  const files = createBlankLevelFiles(FLAT_PRESET)
  const map = new ArxMap(files.dlf, files.fts, files.llf, new Settings({ seed: '1' }))
  const hole = [cellIndex(map, 500, 300), cellIndex(map, 600, 300), cellIndex(map, 500, 400)]

  map.deletePolygons(hole)
  map.translatePolygons([cellIndex(map, 600, 400)], FACE_OFFSET)

  const level = 'level1'
  const output = exportLevelFiles(map)
  const archive = new JSZip()

  archive.file(`game/graph/levels/${level}/fast.fts`, new Uint8Array(output.fts))
  archive.file(`graph/levels/${level}/${level}.dlf`, new Uint8Array(output.dlf))
  archive.file(`graph/levels/${level}/${level}.llf`, new Uint8Array(output.llf))
  archive.file(
    'manifest.json',
    JSON.stringify({
      name: 'Edge snap',
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
 * Clicks the crosshair of the walkable view at a place of the canvas.
 *
 * @remarks
 * The same reason as `clickCrosshair` of the support file: a real mouse event moves the locked camera, so the gesture
 * is dispatched in the page. This one takes the pixels because the map of the test needs a face that is not under the
 * middle of the view.
 *
 * @param view The canvas of the walkable view.
 * @param x The place on the canvas, from its left edge, in pixels.
 * @param y The place on the canvas, from its top edge, in pixels.
 */
async function clickViewAt(view: Locator, x: number, y: number): Promise<void> {
  await view.evaluate(
    (canvas, place) => {
      const box = canvas.getBoundingClientRect()

      function make(type: string): MouseEvent {
        return new MouseEvent(type, {
          clientX: box.left + place.x,
          clientY: box.top + place.y,
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
        })
      }

      canvas.dispatchEvent(make('mousedown'))
      canvas.dispatchEvent(make('mouseup'))
    },
    { x, y },
  )

  await nextFrames(view.page(), 3)
}

/**
 * The translate gizmo rails the selection on the edge of the hole in the plane of the floor.
 *
 * @remarks
 * The face starts 12.068 units from the edge of the hole, and the drag along X ends inside the threshold but not on the
 * edge: the edge rail is what closes the gap. The step of the history carries the snapped offset, so the test reads it
 * there (the editor keeps the steps of a map in the local storage, and the export writes the same list).
 *
 * This is the X case of the owner's map (2026-11-21): it moved nothing before the fix, because the two side edges of a
 * quad (the ones an X drag has to rail on) were left out of the edge list of the rail. The Z case worked, which is why
 * the map is built with the same face instead of a single quad.
 */
test('the edge rail snaps the face of the hole onto the edge of the hole along X', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  await seedLayout(page, editorLayout)
  await page.goto('/')
  await waitForLevel(page)

  await openZip(page, 'edge-snap.zip', await zipOfTheHole())

  // the zip replaces the blank level with the 118 faces of the map (121 minus the three deleted)
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(118)

  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()
  const box = await view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  // the pointer lock comes from a real click, and that click turns the camera: the form writes the pose back
  await lockPointer(page, view)
  await writePose(page, CAMERA_POSE)
  await clickViewAt(view, SELECT_AT.x, SELECT_AT.y)

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

  const magnet = page.locator('[data-widget-kind="3d-view"] .snap-toggle')

  await magnet.click()
  await expect(magnet).toHaveAttribute('aria-pressed', 'true')

  // the red arrow of the gizmo: the drag runs along it, towards the edge of the hole
  await page.mouse.move(box.x + ARROW_AT.x, box.y + ARROW_AT.y)
  await page.mouse.down()
  await page.mouse.move(box.x + ARROW_AT.x + DRAG_PIXELS.x, box.y + ARROW_AT.y + DRAG_PIXELS.y, { steps: 6 })
  await page.mouse.up()

  await expect
    .poll(async () => {
      return await lastStepOf(page)
    })
    .toMatchObject({ kind: 'translateFaces' })

  const step = await lastStepOf(page)

  if (step?.delta === undefined) {
    throw new Error('the drag left no step of a move in the history')
  }

  // the right edge of the face starts at FACE_EDGE_X, so the snapped step is the difference to the edge of the hole
  expect(step.delta.x).toBeCloseTo(HOLE_EDGE_X - FACE_EDGE_X, 6)
  expect(Math.abs(step.delta.y)).toBeLessThan(1e-9)
  expect(Math.abs(step.delta.z)).toBeLessThan(1e-9)
})
