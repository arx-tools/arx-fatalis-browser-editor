import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { DLF } from 'arx-convert'
import JSZip from 'jszip'
import { jumpPoseOf } from '../../src/editor/components/widgets/camera/jumpPose.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import { unpackArxFile } from '../../src/generator/files.ts'
import {
  editorUrlForLevel,
  lockPointer,
  nextFrames,
  readPose,
  seedLayout,
  waitForLayoutSettled,
  writePose,
} from './support/editor.ts'

/**
 * The spawn of the player (TODO 172): the camera button of its row, and the pick of its model in the walkable view.
 *
 * @remarks
 * The spawn is not an entity of the DLF, and it is not on the screen as a number: the tests read it through the camera.
 * The jump of the row stands 300 units behind the eye of the player and keeps the angle of the camera, so the position
 * of the url after a jump is the spawn the level has (see `jumpPoseOf`). The level is the blank one: its spawn is in
 * the middle of the floor, and its one player is enough for both.
 */
const JUMP_DISTANCE = 300

/**
 * Opens the blank level with the entity list, and opens the row of the player.
 *
 * @param page The page to drive.
 * @param query The parameters of the pose the view starts at.
 *
 * @returns The row of the player, and the buttons of the history.
 */
async function openTheSpawn(
  page: Page,
  query: string,
): Promise<{
  readonly player: ReturnType<Page['locator']>
  readonly redo: ReturnType<Page['locator']>
  readonly undo: ReturnType<Page['locator']>
  readonly view: ReturnType<Page['locator']>
}> {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1631, height: 850 })
  await page.goto(`/?map=blank-flat&${query}`)

  // the entity work has a layout of its own: the preset puts the list in the left column, the view in the middle and
  // the steps of the history on the right
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Entities' }).click()

  const list = page.locator('[data-widget-kind="entity-list"]')

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')

  // the player starts folded away, the way the folders do
  await list.locator('.AccordionRow').first().locator('.head').click()

  const player = list.locator('.player-row')

  await expect(player).toHaveCount(1)

  return {
    player,
    redo: page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Redo"]'),
    undo: page.locator('[data-widget-kind="undo-redo"] button[aria-label^="Undo"]'),
    view: page.locator('[data-widget-kind="3d-view"] canvas').first(),
  }
}

/**
 * The place of the camera the url carries.
 *
 * @param page The page to read.
 *
 * @returns The three coordinates of the position, or `undefined` when the url has none.
 */
function positionOf(page: Page): number[] | undefined {
  const value = new URL(page.url()).searchParams.get('position')

  if (value === null) {
    return undefined
  }

  return value.split(',').map(Number)
}

/**
 * The place the camera of the url stands at, when it jumps to the place given.
 *
 * @param page The page to read the angle of.
 * @param x The x of the place the jump goes to, in the game's coordinates.
 * @param y The y of the place.
 * @param z The z of the place.
 *
 * @returns The position of the url after the jump, rounded the way the url keeps it.
 */
function jumpedTo(page: Page, x: number, y: number, z: number): number[] {
  const rotation = new URL(page.url()).searchParams.get('rotation') ?? '0,0,0'
  const [pitch, yaw] = rotation.split(',').map(Number)
  const pose = jumpPoseOf({ position: { x, y, z }, angle: { pitch, yaw } }, { x, y, z }, JUMP_DISTANCE)

  return [pose.position.x, pose.position.y, pose.position.z].map((value) => {
    return Number(value.toFixed(2))
  })
}

/**
 * The place of the camera of the url, and another place, in one shape to compare: the url keeps two decimals.
 *
 * @param page The page to read the url of.
 * @param values The place to compare with, when the test names one.
 *
 * @returns The coordinates as a string, or the current place of the url.
 */
function urlPositionOf(page: Page, values?: readonly number[]): string | undefined {
  const position = values ?? positionOf(page)

  if (position === undefined) {
    return undefined
  }

  return position
    .map((value) => {
      return value.toFixed(2)
    })
    .join(',')
}

test('the camera button puts the spawn where the camera stands, and the undo takes it back', async ({ page }) => {
  const rig = await openTheSpawn(page, 'position=6000,-170,6150&rotation=0,180,0')

  // the selection is not a step of the history: only the move of the spawn is
  await expect(rig.undo).toBeDisabled()

  await rig.player.locator('.from-camera').click()

  // the spawn of the blank level was in the middle of the floor: the camera stands 150 units away, so the step moved it
  await expect(rig.undo).toBeEnabled()

  // the jump of the row goes behind the eye of the player: the spawn is the eye the camera gave it
  await rig.player.locator('.jump').click()
  await expect
    .poll(() => {
      return urlPositionOf(page)
    })
    .toBe(urlPositionOf(page, jumpedTo(page, 6000, -170, 6150)))

  // the undo puts the spawn back under the middle of the floor, and the jump goes there
  await rig.undo.click()
  await rig.player.locator('.jump').click()
  await expect
    .poll(() => {
      return urlPositionOf(page)
    })
    .toBe(urlPositionOf(page, jumpedTo(page, 6000, -170, 6000)))

  // and the redo brings the one of the camera back
  await rig.redo.click()
  await rig.player.locator('.jump').click()
  await expect
    .poll(() => {
      return urlPositionOf(page)
    })
    .toBe(urlPositionOf(page, jumpedTo(page, 6000, -170, 6150)))
})

test('the gizmo moves the spawn, and the undo takes it back', async ({ page }) => {
  // the camera looks at the middle of the player from 150 units away and 80 down: the middle of the model stands in the
  // middle of the view, where the gizmo is, and its arrows are the pixels around the middle
  const rig = await openTheSpawn(page, 'position=6000,-170,6150&rotation=28.1,180,0')
  const box = await rig.view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  await rig.player.locator('.name').click()
  await expect(rig.player).toHaveAttribute('data-selected', 'true')

  // the selection is not a step of the history: only the drag is
  await expect(rig.undo).toBeDisabled()

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const middle = { x: box.x + halfWidth, y: box.y + halfHeight }

  // the red arrow of the gizmo, from the middle of the model to the right of the screen
  await page.mouse.move(middle.x + 22, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 66, middle.y, { steps: 8 })
  await page.mouse.up()

  await expect(rig.undo).toBeEnabled()

  // the jump of the row goes behind the eye of the player: the place of the url is the spawn the drag left
  await rig.player.locator('.jump').click()
  await expect
    .poll(() => {
      return urlPositionOf(page)
    })
    .not.toBe(urlPositionOf(page, jumpedTo(page, 6000, -170, 6000)))

  // the undo puts the spawn back under the middle of the floor
  await rig.undo.click()
  await rig.player.locator('.jump').click()
  await expect
    .poll(() => {
      return urlPositionOf(page)
    })
    .toBe(urlPositionOf(page, jumpedTo(page, 6000, -170, 6000)))
})

test('the export writes the spawn the camera gave the level', async ({ page }) => {
  const rig = await openTheSpawn(page, 'position=6000,-170,6150&rotation=0,180,0')

  await rig.player.locator('.from-camera').click()

  // the export dialog of the header writes the archive of the level, and the dialog knows the index of the files
  await page.locator('header button[aria-label="Export the level as a zip"]').click()

  const dialog = page.locator('[role="dialog"][aria-label="Export Map"]')

  await expect(dialog).toBeVisible()

  const index = await dialog.locator('#export-level-index').inputValue()
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.locator('.export').click()])
  const archive = await JSZip.loadAsync(await readFile((await download.path()) ?? ''))
  const packed = await archive.file(`graph/levels/level${index}/level${index}.dlf`)?.async('arraybuffer')

  if (packed === undefined) {
    throw new TypeError('the archive has no level of the export')
  }

  // the description of the level keeps the eye of the player, in the space of the level: the camera stands at the spawn,
  // and the scene position of the level shifts the world the url carries (6000, 0, 6000 on the blank level)
  const dlf = DLF.load(unpackArxFile(packed, 'dlf'))

  expect(dlf.header.player.position).toEqual({ x: 0, y: -170, z: 150 })
  expect(dlf.header.player.orientation.b).toBe(180)
})

/**
 * The layout of the pick: the entity list (the row of the player is the answer), the walkable view and the camera form
 * (the camera has to leave the body of the player, or the model is not a target).
 */
const PICK_LAYOUT = {
  type: 'split',
  orientation: 'horizontal',
  sizes: [
    { kind: 'fixed', px: 360 },
    { kind: 'auto', ratio: 1 },
    { kind: 'fixed', px: 300 },
  ],
  children: [
    { type: 'widget', kind: WIDGET_KINDS.entityList },
    { type: 'widget', kind: WIDGET_KINDS.view3d },
    { type: 'widget', kind: WIDGET_KINDS.cameraControls },
  ],
} as const

/**
 * Picks the spawn of the level under the crosshair of the walkable view.
 *
 * @remarks
 * The camera of a level starts at the spawn, that is, inside the body of the player: the model is not a target there, so
 * the camera steps 60 units back along its own forward first (the jump of a row, without the row). The click of the
 * crosshair then lands on the model, and the row of the player says it is picked.
 *
 * @param page The page of the test.
 */
async function pickTheSpawn(page: Page): Promise<void> {
  const list = page.locator('[data-widget-kind="entity-list"]')
  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')
  await waitForLayoutSettled(page)

  // the row of the player starts folded away: the pick opens it, and the row says it is picked
  await list.locator('.AccordionRow').first().locator('.head').click()

  const player = list.locator('.player-row')

  await expect(player).toHaveCount(1)
  await expect(player).toHaveAttribute('data-selected', 'false')

  // the model of the player arrives after the level, and the pick needs it on the screen: the view says when it is placed
  await expect(page.locator('[data-widget-kind="3d-view"] [data-player-model]')).toHaveAttribute(
    'data-player-model',
    'true',
  )

  const pose = await readPose(page)
  const eye = { x: Number(pose.x), y: Number(pose.y), z: Number(pose.z) }
  const angle = { pitch: Number(pose.pitch), yaw: Number(pose.yaw) }
  const stepped = jumpPoseOf({ position: eye, angle }, eye, 60)

  await writePose(page, {
    ...pose,
    x: String(stepped.position.x),
    y: String(stepped.position.y),
    z: String(stepped.position.z),
  })

  await lockPointer(page, view)

  // a click under the pointer lock reads the crosshair, which stands on the model. The click is made again while the
  // row is not picked: the model of the view changes to the whole one on a frame of its own (the camera left the body),
  // and the first click can land before that frame (2026-11-26, the textures of the model made the frame later)
  await expect
    .poll(
      async () => {
        await page.mouse.down()
        await page.mouse.up()
        await nextFrames(page, 2)

        return await player.getAttribute('data-selected')
      },
      { timeout: 5000 },
    )
    .toBe('true')
}

test('the model of the player picks the spawn with a click of the walkable view', async ({ page, browserName }) => {
  // the pick of the walkable view reads the gesture under the pointer lock: that is chromium only in this suite
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // the fixture data dir carries the `human_base` model of the game, so the walkable view draws the player of the level
  await seedLayout(page, PICK_LAYOUT)
  await page.goto(editorUrlForLevel(8))

  await pickTheSpawn(page)
})

test('the model of the generator picks the spawn of a blank level', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'the pointer lock of the walkable view needs chromium here')
  test.setTimeout(120_000)

  // a level made from nothing has no data directory: the model of the player comes from the build of the generator
  await seedLayout(page, PICK_LAYOUT)
  await page.goto('/?map=blank-flat')

  await pickTheSpawn(page)
})
