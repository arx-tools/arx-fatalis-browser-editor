import { expect, test, type Locator, type Page } from '@playwright/test'
import type { TripleOf } from 'arx-convert/utils'
import { testLayout } from '../support/layouts.ts'
import {
  clickCrosshair,
  layoutWithTheKeys,
  lockPointer,
  readPose,
  seedLayout,
  selectionCount,
  statOf,
  waitForLevel,
  writePose,
} from './support/editor.ts'

/**
 * The camera pose of a map, kept per map.
 *
 * @remarks
 * The pose is a place in a map, so switching maps may not carry it: the camera goes back to the place each map was left
 * at, and the url is the map and the pose **pair**. The poses live in the browser (`mapPoses`) beside the steps of the
 * history, but they are not part of it: undo and redo do not move the camera.
 *
 * The tests use the blank maps (the editor brings them, no level comes over the network), so a map switch is quick and
 * needs no data directory.
 */
test.setTimeout(120_000)

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
 * Opens a map of the list through the header.
 *
 * @param page The page to drive.
 * @param id The value of the map, like `blank:minimal`.
 * @param faces How many faces the map has, so the test waits for the new level instead of the one that goes away.
 */
async function openMapOfTheList(page: Page, id: string, faces: number): Promise<void> {
  await mapSelect(page).selectOption(id)

  await expect
    .poll(
      async () => {
        return await statOf(page, 'Total faces')
      },
      { timeout: 30_000 },
    )
    .toBe(faces)
}

/**
 * The pose of the url, as a link carries it.
 *
 * @param page The page to read.
 *
 * @returns The position and the rotation of the address bar, `null` when the url has none.
 */
function urlPoseOf(page: Page): { position: string | null; rotation: string | null } {
  const url = new URL(page.url())

  return { position: url.searchParams.get('position'), rotation: url.searchParams.get('rotation') }
}

/**
 * Reads the poses the browser keeps.
 *
 * @remarks
 * The editor writes the pose of a map into the storage after a short delay (`POSE_WRITE_DELAY_IN_MS`), so a test that
 * leaves the page right after moving the camera can leave **before** the pose is kept, and the next load opens at the
 * pose of the load before it (measured: the suite hit it once the waits of the helpers got shorter). A test that counts
 * on the stored pose waits for the storage itself, and not for a moment guessed at the length of the delay.
 *
 * @param page The page to read.
 *
 * @returns The text of the key the poses live under, empty when the browser has none yet.
 */
async function storedPosesOf(page: Page): Promise<string> {
  return await page.evaluate(() => {
    return localStorage.getItem('mapPoses') ?? ''
  })
}

/**
 * Waits for a pose of the map to be written into the storage.
 *
 * @remarks
 * The wait is for the **whole pose**, and not for a change of the text: the editor writes the pose of the level it opens
 * too (the spawn), and the fields of the camera form apply one by one, so the storage can hold the position of the
 * wanted pose with the facing of the load before it (measured: the yaw of the spawn, 180, came back instead of 45). The
 * value is the object of the poses, the key of each map over the position and the rotation.
 *
 * @param page The page to wait in.
 * @param wanted The pose to look for.
 * @param wanted.position The position of it.
 * @param wanted.yaw The yaw of its facing.
 */
async function waitForPoseStored(page: Page, wanted: { position: TripleOf<number>; yaw: number }): Promise<void> {
  await expect
    .poll(async () => {
      const text = await storedPosesOf(page)
      let poses: Record<string, { position: TripleOf<number>; rotation: TripleOf<number> }> = {}

      if (text !== '') {
        poses = JSON.parse(text) as typeof poses
      }

      return Object.values(poses).some((pose) => {
        const [x, y, z] = pose.position ?? []
        const [, yaw] = pose.rotation ?? []

        return x === wanted.position[0] && y === wanted.position[1] && z === wanted.position[2] && yaw === wanted.yaw
      })
    })
    .toBe(true)
}

test('a map switch goes back to the place each map was left at', async ({ page }) => {
  await seedLayout(page, testLayout)
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  // the camera is moved on the flat plane, and the url carries the map and the pose together
  await writePose(page, { x: '100', y: '200', z: '300', pitch: '10', yaw: '90', roll: '0' })
  await waitForPoseStored(page, { position: [100, 200, 300], yaw: 90 })

  await expect
    .poll(() => {
      return urlPoseOf(page).position
    })
    .toBe('100,200,300')

  // the plane is left, and the small map opens where its own player stands, not at the numbers of the plane
  await openMapOfTheList(page, 'blank:minimal', 1)

  const minimal = await readPose(page)

  expect(minimal.x).not.toBe('100.00')

  // and back: the plane is where it was left
  await openMapOfTheList(page, 'blank:flat', 121)

  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return [pose.x, pose.y, pose.z, pose.yaw]
    })
    .toEqual(['100.00', '200.00', '300.00', '90.00'])
})

test('the map and the pose of the last visit come back without a link', async ({ page }) => {
  await seedLayout(page, testLayout)
  await page.goto('/?map=blank-minimal')
  await waitForLevel(page)

  await writePose(page, { x: '111', y: '222', z: '333', pitch: '0', yaw: '45', roll: '0' })
  await waitForPoseStored(page, { position: [111, 222, 333], yaw: 45 })

  await expect
    .poll(() => {
      return urlPoseOf(page).position
    })
    .toBe('111,222,333')

  // a bare address: the map of the last visit opens, and the camera goes to the pose that map was left at
  await page.goto('./')

  await expect
    .poll(
      async () => {
        return await mapSelect(page).inputValue()
      },
      { timeout: 30_000 },
    )
    .toBe('blank:minimal')

  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return [pose.x, pose.y, pose.z, pose.yaw]
    })
    .toEqual(['111.00', '222.00', '333.00', '45.00'])
})

test('a link carries the pose of the map it names, and only that one', async ({ page }) => {
  await seedLayout(page, testLayout)

  // the link is the pair: the map and its pose
  await page.goto('/?map=blank-flat&position=100,200,300&rotation=0,90,0')
  await waitForLevel(page)

  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return [pose.x, pose.y, pose.z, pose.yaw]
    })
    .toEqual(['100.00', '200.00', '300.00', '90.00'])

  // the pose of the link is the pose of its map now: a link without the numbers comes back to it, so the storage has to
  // have it before the page goes
  await waitForPoseStored(page, { position: [100, 200, 300], yaw: 90 })

  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  await expect
    .poll(async () => {
      const pose = await readPose(page)

      return pose.x
    })
    .toBe('100.00')

  // and it is not the pose of another map: the small map opens on its own player
  await page.goto('/?map=blank-minimal')
  await waitForLevel(page)

  const minimal = await readPose(page)

  expect(minimal.x).not.toBe('100.00')
})

test('the camera does not move when a step is taken back or made again', async ({ page }) => {
  await seedLayout(page, layoutWithTheKeys())
  await page.goto('/?map=blank-flat')
  await waitForLevel(page)

  // the camera looks down at the floor, so the crosshair has a face to pick
  const looking = { x: '550', y: '-180', z: '550', pitch: '90', yaw: '180', roll: '0' }
  const view = page.locator('[data-widget-kind="3d-view"] canvas').first()

  await lockPointer(page, view)
  await writePose(page, looking)

  const before = await readPose(page)

  await clickCrosshair(view)
  await expect
    .poll(async () => {
      return await selectionCount(page)
    })
    .toBeGreaterThan(0)

  await page.keyboard.press('Delete')

  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBeLessThan(121)

  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBe(121)

  await page.keyboard.press('Control+y')
  await expect
    .poll(async () => {
      return await statOf(page, 'Total faces')
    })
    .toBeLessThan(121)

  // the camera is where the steps found it: the pose is not a step of the history
  expect(await readPose(page)).toEqual(before)
})
