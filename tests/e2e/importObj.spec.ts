import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { NO_ROOM } from '../../src/editor/modules/rooms/roomList.ts'
import { testLayout } from '../support/layouts.ts'
import { seedLayout, selectionCount, statOf, waitForLevel } from './support/editor.ts'

/**
 * The OBJ import (TODO 304): the dialog of the header, the faces of the file in the level, the step of the history and
 * the export.
 *
 * @remarks
 * The file is a cube of six quads and one unit on a side, so the scale of the dialog is a number the test can read back
 * from the file it exports: at a scale of ten the cube is ten units wide, and the corners of the exported level sit
 * around the origin of the blank level (which is the middle of its floor, the scene position of the tiles).
 */
test.setTimeout(120_000)

/**
 * The OBJ the test imports.
 */
const CUBE_OBJ = fileURLToPath(new URL('fixtures/import/cube.obj', import.meta.url))

/**
 * The faces of the cube: one per side.
 */
const CUBE_FACES = 6

/**
 * The scale the test writes into the dialog: one unit of the file in ten units of the level.
 */
const CUBE_SCALE = 10

/**
 * How far the corners of the cube stand from its middle, in the units of the level.
 */
const CUBE_HALF = CUBE_SCALE / 2

/**
 * Reads the level the editor exports as a zip.
 *
 * @param page The page to read.
 *
 * @returns The level of the archive.
 */
async function exportedLevelOf(page: Page): Promise<ArxMap> {
  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')

  await expect(dialog).toBeVisible()

  const index = await dialog.locator('#export-level-index').inputValue()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])

  await dialog.locator('button[aria-label="Close"]').click()
  await expect(dialog).toBeHidden()

  const archive = await JSZip.loadAsync(await readFile((await download.path()) ?? ''))

  /**
   * Reads one file of the archive.
   *
   * @param path The path of the file inside the archive.
   *
   * @returns The bytes of the file.
   */
  async function fileOf(path: string): Promise<ArrayBuffer> {
    const packed = await archive.file(path)?.async('arraybuffer')

    if (packed === undefined) {
      throw new TypeError(`the archive has no ${path}`)
    }

    return packed
  }

  return new ArxMap(
    await fileOf(`graph/levels/level${index}/level${index}.dlf`),
    await fileOf(`game/graph/levels/level${index}/fast.fts`),
    await fileOf(`graph/levels/level${index}/level${index}.llf`),
  )
}

test('an OBJ file comes into the level, and the undo takes it out', async ({ page }) => {
  await page.setViewportSize({ width: 1631, height: 850 })
  await seedLayout(page, testLayout)
  await page.goto('/?map=blank-flat')

  const before = await waitForLevel(page)

  await page.locator('header button[aria-label="Import a mesh from an OBJ file"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Import OBJ"]')

  await expect(dialog).toBeVisible()

  const importButton = dialog.locator('footer button')

  // the dialog waits for a file: the button can not run before one is chosen
  await expect(importButton).toBeDisabled()
  await expect(dialog.locator('.file-name')).toHaveText('no file chosen')
  // the scale starts on the units of the file: a model made in the units of the game needs no number
  await expect(dialog.locator('#import-obj-scale')).toHaveValue('1')

  await page.locator('.ImportObj input[type="file"]').setInputFiles(CUBE_OBJ)
  await expect(dialog.locator('.file-name')).toHaveText('cube.obj')

  await dialog.locator('#import-obj-scale').fill(String(CUBE_SCALE))
  await expect(importButton).toBeEnabled()

  await importButton.click()
  await expect(dialog).toBeHidden()

  // the six faces of the cube are in the level, and they are the selection
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(before + CUBE_FACES)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(CUBE_FACES)

  // the dialog says the imported faces are in no room: the game draws the faces of a room only
  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const exportDialog = page.locator('[role="dialog"][aria-label="Export Map"]')

  await expect(exportDialog.locator('.warning')).toHaveText('6 faces have no room: the game never draws them.')
  await exportDialog.locator('button[aria-label="Close"]').click()
  await expect(exportDialog).toBeHidden()

  // the file carries the cube around the origin of the level, with the one container of the level
  const imported = await exportedLevelOf(page)

  expect(imported.polygons.length).toBe(before + CUBE_FACES)

  // the export sorts the faces of the level into the cells of the file, so the faces of the cube are the ones with no
  // room (the blank level has its floor in room 1, and an imported mesh is out of every room until the author moves it)
  const cube = imported.polygons.filter((polygon) => {
    return polygon.room === NO_ROOM
  })
  const scene = imported.scenePosition
  const places = cube.flatMap((polygon) => {
    return polygon.vertices
  })

  expect(
    Math.min(
      ...places.map((vertex) => {
        return vertex.x
      }),
    ),
  ).toBeCloseTo(scene.x - CUBE_HALF, 1)
  expect(
    Math.max(
      ...places.map((vertex) => {
        return vertex.x
      }),
    ),
  ).toBeCloseTo(scene.x + CUBE_HALF, 1)
  // the game's Y points down: the up of the file is the smaller y of the level
  expect(
    Math.min(
      ...places.map((vertex) => {
        return vertex.y
      }),
    ),
  ).toBeCloseTo(scene.y - CUBE_HALF, 1)
  expect(
    Math.max(
      ...places.map((vertex) => {
        return vertex.y
      }),
    ),
  ).toBeCloseTo(scene.y + CUBE_HALF, 1)

  // the cube is out of every room (the author moves it into the rooms of the level), and the level keeps its own
  expect(cube.length).toBe(CUBE_FACES)
  expect(
    new Set(
      cube.map((polygon) => {
        return polygon.room
      }),
    ),
  ).toEqual(new Set([NO_ROOM]))
  expect(
    new Set(
      imported.polygons
        .filter((polygon) => {
          return polygon.room !== NO_ROOM
        })
        .map((polygon) => {
          return polygon.room
        }),
    ),
  ).toEqual(new Set([1]))

  // the blank level draws with the missing texture already: the import reuses its container (the id 1 of the generator)
  expect(imported.fts.textureContainers.length).toBe(1)
  expect(
    cube.every((polygon) => {
      return polygon.textureContainerId === 1
    }),
  ).toBe(true)

  // the step is one of the history: the undo takes the faces out again
  await page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]').click()

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(before)

  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBe(0)
})
