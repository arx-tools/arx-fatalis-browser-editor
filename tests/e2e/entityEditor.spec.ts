import { readFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { jumpPoseOf } from '../../src/editor/components/widgets/camera/jumpPose.ts'
import { ENTITY_JUMP_DISTANCE } from '../../src/editor/modules/level/entities/entityRows.ts'
import { ArxMap } from '../../src/generator/ArxMap.ts'
import { editorUrl, waitForLayoutSettled } from './support/editor.ts'

/**
 * The entity editor: the drop to the floor of the picked entity, and of the spawn of the player (TODO 320).
 *
 * @remarks
 * The widget writes the level, so the tests read it back from the **export** of the level: the file is what the author
 * takes out of the editor, and it carries the entity of the DLF, the spawn of the header and the scene position that
 * tells the space of both. The place of an entity is read from the url too: the jump of its row puts the camera behind
 * it with the angles the camera has, so at a pitch of 0 the y of the url is the y of the entity in the game (see
 * `jumpPoseOf`).
 */
test.setTimeout(120_000)

/**
 * The place the camera of the url stands at.
 *
 * @param page The page to read.
 *
 * @returns The three coordinates of the pose.
 *
 * @throws When the url has no position (the page is not on the editor).
 */
function placeOf(page: Page): { x: number; y: number; z: number } {
  const value = new URL(page.url()).searchParams.get('position')

  if (value === null) {
    throw new TypeError('the url has no position')
  }

  const [x = 0, y = 0, z = 0] = value.split(',').map(Number)

  return { x, y, z }
}

/**
 * The place of the camera of the url, as one text to compare.
 *
 * @param page The page to read.
 *
 * @returns The three coordinates of the pose, in a string.
 */
function placeTextOf(page: Page): string {
  return new URL(page.url()).searchParams.get('position') ?? ''
}

/**
 * Jumps the camera of the walkable view to a row of the list, and waits for the url to carry the new place.
 *
 * @remarks
 * The camera writes its pose into the url on a debounce, so a click and a read of the url are not the same moment: the
 * jump is the one of the row, and the place is the one the url shows after it.
 *
 * @param page The page to drive.
 * @param row The row of the list, with its jump button.
 * @param previous The place of the url before the jump, which the read waits to go away.
 *
 * @returns The place of the camera after the jump.
 */
async function jumpAndRead(page: Page, row: Locator, previous: string): Promise<{ x: number; y: number; z: number }> {
  await row.locator('.jump').click()
  await expect
    .poll(() => {
      return placeTextOf(page)
    })
    .not.toBe(previous)

  return placeOf(page)
}

/**
 * Opens the editor on a level, with the Entities preset on the dock.
 *
 * @param page The page to drive.
 * @param url The url of the level, with the pose the camera starts at.
 */
async function openEntities(page: Page, url: string): Promise<void> {
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(url)

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Entities' }).click()
  await waitForLayoutSettled(page)
}

/**
 * Reads the level the editor exports as a zip.
 *
 * @remarks
 * The dialog writes the three files of the level under the paths of the data directory, so the level loads back through
 * the same `ArxMap` the editor draws it with: the entity, the spawn and the scene position of the test are the ones of
 * the file, not a copy of the editor's memory.
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

  // the dialog stays over the dock after the archive is written: the tests after this one click into the editor
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

test('the entity editor drops the picked entity to the floor, and the undo takes it back', async ({ page }) => {
  // the pitch of the camera is 0, so the y of the url after a jump of a row is the y of the entity in the game
  await openEntities(page, `${editorUrl()}&position=0,0,0&rotation=0,90,0`)

  const list = page.locator('[data-widget-kind="entity-list"]')
  const editor = page.locator('[data-widget-kind="entity-editor"]')
  const drop = editor.locator('[data-action="drop-to-floor"]')
  const undo = page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]')

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')

  // nothing is picked: the widget says what it waits for, and the button can not be pressed
  await expect(editor.locator('.picked')).toHaveAttribute('data-picked', 'none')
  await expect(editor.locator('.picked .value')).toHaveText('Select an entity or the player spawn')
  await expect(drop).toBeDisabled()

  // the camera of the level is entity 0 of the DLF: it floats 160 units over the floor of the level
  await list.locator('.AccordionRow', { hasText: 'system' }).locator('.head').click()

  const row = list.locator('[data-entity-index="0"]')

  await expect(row).toHaveCount(1)
  await row.locator('.name').click()

  // the pick of the row is the one of the widget: the name of the game, and the identifier
  await expect(editor.locator('.picked')).toHaveAttribute('data-picked', 'entity')
  await expect(editor.locator('.picked .value')).toHaveText('camera_0027 (#27)')
  await expect(drop).toBeEnabled()

  // the place before the drop: the jump of the row stands 300 units behind the entity, at its height
  const before = await jumpAndRead(page, row, placeTextOf(page))

  await drop.click()
  await expect(undo).toBeEnabled()

  const after = await jumpAndRead(page, row, placeTextOf(page))

  // the game's Y points down, so the entity that went down to the floor has a bigger y, over the same spot
  expect(after.y).toBeGreaterThan(before.y)
  expect(after.x).toBe(before.x)
  expect(after.z).toBe(before.z)

  // the file carries the place the row of the list jumps to: the DLF keeps the place in the space of the level, which
  // the scene position shifts (see `worldPositionToGame`), and the jump stands `ENTITY_JUMP_DISTANCE` behind it
  const dropped = await exportedLevelOf(page)
  const droppedEntity = dropped.entities[0]

  if (droppedEntity === undefined) {
    throw new TypeError('the level has no entity 0')
  }

  const scene = dropped.scenePosition
  const target = {
    x: scene.x + droppedEntity.position.x,
    y: scene.y + droppedEntity.position.y,
    z: scene.z + droppedEntity.position.z,
  }
  const [pitch = 0, yaw = 0] = (new URL(page.url()).searchParams.get('rotation') ?? '0,0').split(',').map(Number)
  const jumped = jumpPoseOf({ position: { x: 0, y: 0, z: 0 }, angle: { pitch, yaw } }, target, ENTITY_JUMP_DISTANCE)

  // the url keeps two decimals of the place the camera stands at
  expect(after).toEqual({
    x: Number(jumped.position.x.toFixed(2)),
    y: Number(jumped.position.y.toFixed(2)),
    z: Number(jumped.position.z.toFixed(2)),
  })

  // the undo puts the entity back where it was
  await undo.click()

  expect(await jumpAndRead(page, row, placeTextOf(page))).toEqual(before)

  // the snake woman of the level has no face under her: the drop keeps her in place, says why, and is not a step
  await list.locator('.AccordionRow', { hasText: 'npc' }).locator('.head').click()

  const snake = list.locator('[data-entity-index="6"]')

  await expect(snake).toHaveCount(1)
  await expect(undo).toBeDisabled()

  await snake.locator('.name').click()
  await expect(editor.locator('.picked .value')).toHaveText('snake_woman_base_0010 (#10)')

  await drop.click()

  await expect(editor.locator('.message')).toHaveText('No floor below snake_woman_base_0010')
  await expect(undo).toBeDisabled()
})

test('the entity editor drops the spawn of the player to the floor', async ({ page }) => {
  // the camera of the blank level stands 400 units over its floor, and it looks along the x of the level
  await openEntities(page, '/?map=blank-flat&position=6000,-570,6150&rotation=0,180,0')

  const list = page.locator('[data-widget-kind="entity-list"]')
  const editor = page.locator('[data-widget-kind="entity-editor"]')
  const drop = editor.locator('[data-action="drop-to-floor"]')
  const undo = page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]')

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')

  await list.locator('.AccordionRow').first().locator('.head').click()

  const player = list.locator('.player-row')

  await expect(player).toHaveCount(1)
  await expect(drop).toBeDisabled()

  // the spawn goes where the camera stands: its feet are 400 units over the floor of the level
  await player.locator('.from-camera').click()
  await player.locator('.name').click()

  // the row of the player is the pick of the spawn in the widget
  await expect(editor.locator('.picked')).toHaveAttribute('data-picked', 'player')
  await expect(editor.locator('.picked .value')).toHaveText('Player spawn')
  await expect(drop).toBeEnabled()

  await drop.click()

  // the drop puts the feet of the player on the floor of the blank level, and the DLF keeps the eye, 170 above them
  const dropped = await exportedLevelOf(page)

  expect(dropped.player.position).toEqual({ x: 0, y: -170, z: 150 })
  expect(dropped.player.orientation.b).toBe(180)

  // the undo puts the spawn back where the camera stood
  await undo.click()

  const restored = await exportedLevelOf(page)

  expect(restored.player.position).toEqual({ x: 0, y: -570, z: 150 })
})
