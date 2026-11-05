import { expect, type Locator, type Page } from '@playwright/test'
import { editorLayout } from '../../../src/editor/modules/layout/layoutPresets.ts'
import type { LayoutNode } from '../../../src/editor/modules/layout/layoutNode.ts'
import { WIDGET_KINDS } from '../../../src/editor/modules/layout/widgetKinds.ts'
import { ORIGINAL_LEVEL_PARAMETER } from '../../../src/editor/modules/level/source/levelSource.ts'

/**
 * Starts the page with the given layout on the dock.
 *
 * @remarks
 * The editor reads its layout back from the storage, so a test that wants a widget the default layout does not
 * have (the camera form of the `editor` preset, the inspector) writes the layout before the page runs. It has to
 * be an init script: the app writes its own layout back from a debounce, so a write after the load can lose the
 * race (measured, see the note about the layout in the context of the e2e).
 *
 * @param page The page to prepare.
 * @param layout The tree to put into the storage: the presets are exported by the editor, so a test can name
 * the one it wants instead of spelling it out.
 */
/**
 * The original level the e2e opens.
 *
 * @remarks
 * The editor starts with the level the owner of the project is looking at (it is a temporary constant), and that one
 * can be a big level: level 1 is 58 963 faces, level 8 is 1 277, and the whole run is about twice as fast on the
 * small one (measured: 1.8 minutes against 50 seconds). Nothing in a spec depends on which level it is — the numbers
 * are read from the page — so the tests ask for the small one through the url.
 */
export const E2E_LEVEL = 8

/**
 * The url the e2e opens: the editor, on the level of {@link E2E_LEVEL}.
 *
 * @returns The url of the editor, without the host.
 */
export function editorUrl(): string {
  return `/?${ORIGINAL_LEVEL_PARAMETER}=${String(E2E_LEVEL)}`
}

/**
 * Puts a layout into the storage the editor reads at start.
 *
 * @param page The page to prepare.
 * @param layout The tree the editor should start with.
 */
export async function seedLayout(page: Page, layout: LayoutNode): Promise<void> {
  await page.addInitScript((seeded: unknown) => {
    // a navigation (a reload included) runs this script again: the layout of the editor is only seeded when there is
    // none, so a test that reloads keeps what the editor wrote in the first round
    if (localStorage.getItem('layout') !== null) {
      return
    }

    localStorage.clear()
    localStorage.setItem('layout', JSON.stringify(seeded))
  }, layout)
}

/**
 * Reads the value of a row of an info widget.
 *
 * @remarks
 * The rows are a `dt`/`dd` pair per line: the label is what a test knows, the index of the row is not.
 *
 * @param page The page to read.
 * @param kind The kind of the widget, like `map-statistics`.
 * @param label The text of the cell on the left of the row.
 *
 * @returns The text of the value next to the label, an empty string when the widget has no such row.
 */
export async function rowOf(page: Page, kind: string, label: string): Promise<string> {
  const widget = page.locator(`[data-widget-kind="${kind}"]`)
  const index = await widget.locator('dt').evaluateAll((cells, wanted) => {
    return cells.findIndex((cell) => {
      return cell.textContent === wanted
    })
  }, label)

  if (index < 0) {
    return ''
  }

  return (await widget.locator('dd').nth(index).textContent()) ?? ''
}

/**
 * The value of a row of the map statistics, as a number.
 *
 * @param page The page to read.
 * @param label The text of the cell on the left of the row.
 *
 * @returns The number the row shows, or `undefined` while the row still shows the pending dots.
 */
export async function statOf(page: Page, label: string): Promise<number | undefined> {
  const text = await rowOf(page, WIDGET_KINDS.mapStatistics, label)

  if (/^\s*…\s*$/u.test(text)) {
    return undefined
  }

  return Number(text.replaceAll(/\s/gu, ''))
}

/**
 * How many faces the selection holds, as the selection inspector shows it.
 *
 * @remarks
 * The count moved out of the statistics with the texture round: the selection is what the selection inspector is about,
 * so the tests read it there (the layout they seed has the widget on the dock, see {@link painterLayout}).
 *
 * @param page The page to read.
 *
 * @returns The number of the selected faces, or `undefined` before the widget is on the screen.
 */
export async function selectionCount(page: Page): Promise<number | undefined> {
  const value = await rowOf(page, WIDGET_KINDS.selectionInspector, 'Selected faces')
  const text = value.trim()

  if (text === '') {
    return undefined
  }

  return Number(text.replaceAll(/\s/gu, ''))
}

/**
 * Renames the kinds of a layout tree.
 *
 * @param layout The tree to walk.
 * @param renames The kinds to swap, by the kind they have in the tree.
 *
 * @returns The tree, with the kinds of `renames` in the place of the ones they replace.
 */
function renameKinds(layout: LayoutNode, renames: Readonly<Record<string, string>>): LayoutNode {
  if (layout.type === 'widget') {
    return { type: 'widget', kind: renames[layout.kind] ?? layout.kind }
  }

  return {
    ...layout,
    children: layout.children.map((child) => {
      return renameKinds(child, renames)
    }),
  }
}

/**
 * The editor preset, with the selection inspector in the place of the polygon inspector.
 *
 * @remarks
 * The count of the selected faces moved out of the statistics with the texture round, so a test that selects faces reads
 * it in the selection inspector (see {@link selectionCount}). The two widgets of the round are not in a preset of the
 * factory ones (the owner lays out the `Painter` one later), so the test seeds the editor preset with the kind swapped:
 * the inspector takes the slot of the polygon inspector, which keeps the size the owner measured (350 × 190) and the
 * camera form the tests aim the camera with.
 *
 * @returns The tree to put into the storage.
 */
export function layoutWithSelectionInspector(): LayoutNode {
  return renameKinds(editorLayout, { [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.selectionInspector })
}

/**
 * The editor preset with both widgets of the texture round on the dock.
 *
 * @remarks
 * The selection inspector takes the place of the polygon inspector (the same size) and the texture list the place of the
 * keys: a test that paints faces needs both, and nothing in it reads the key table.
 *
 * @returns The tree to put into the storage.
 */
export function painterLayout(): LayoutNode {
  return renameKinds(layoutWithSelectionInspector(), { [WIDGET_KINDS.keyboardShortcuts]: WIDGET_KINDS.textures })
}

/**
 * The layout of a test of the uv mapper: the painter layout, with the uv mapper in the place of the texture list.
 *
 * @returns The tree to put into the storage.
 */
export function uvLayout(): LayoutNode {
  return renameKinds(painterLayout(), { [WIDGET_KINDS.textures]: WIDGET_KINDS.uvMapper })
}

/**
 * Waits until the level is on, and gives the value of a row of the statistics.
 *
 * @remarks
 * The statistics is the signal the editor gives when the level is ready: its rows show the pending dots until
 * the mesh is built, so a number there means the level is on. The timeout is long because the level is
 * downloaded (see the note in the spec of the deletion about why it comes over the network).
 *
 * @param page The page to read.
 * @param label The row to read, `Total faces` by default.
 *
 * @returns The number the row shows.
 */
export async function waitForLevel(page: Page, label = 'Total faces'): Promise<number> {
  await expect
    .poll(
      async () => {
        return await statOf(page, label)
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(0)

  const value = await statOf(page, label)

  if (value === undefined) {
    throw new Error(`the level is not on: ${label} still shows the pending dots`)
  }

  return value
}

/**
 * Takes the pointer lock, with a real click in the middle of the walkable view.
 *
 * @remarks
 * The lock is what the walkable view needs before it reads a gesture at all, and only a real click asks the
 * browser for it. The first click locks and selects nothing: the press still finds the pointer free.
 *
 * @param page The page to click.
 * @param view The canvas of the walkable view.
 */
export async function lockPointer(page: Page, view: Locator): Promise<void> {
  const box = await view.boundingBox()

  if (box === null) {
    throw new Error('the view has no box')
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  await page.mouse.click(box.x + halfWidth, box.y + halfHeight)
}

/**
 * What a gesture of the walkable view does.
 */
export interface SelectionGesture {
  /**
   * Adds to the selection instead of starting a new one.
   */
  readonly shift?: boolean
  /**
   * Takes away from the selection.
   */
  readonly ctrl?: boolean
  /**
   * How many clicks the gesture holds: two of them and a double click make the area click.
   */
  readonly clicks?: number
}

/**
 * Clicks the crosshair of the walkable view.
 *
 * @remarks
 * The events are dispatched by the page, not by playwright, and the pointer lock is the reason. Chromium moves
 * the cursor into the middle of the element it locked, while a real mouse event from playwright carries the
 * absolute coordinates of the test: every real click therefore reports a movement of several hundred pixels,
 * the camera turns, and the crosshair is no longer on the face the test picked. The events here reach the same
 * listeners of the editor (the `mousedown`, `mouseup` and `dblclick` of the document, bubbling up from the
 * canvas) and the same pick, without a movement — so the camera stands still and the same face stays under the
 * crosshair. The lock itself has to come from a real click, see {@link lockPointer}.
 *
 * The mode of the gesture comes from the modifiers of the event (`selectionModeOf` reads them off the click),
 * so the flags here decide it: `shift` adds, `ctrl` removes, and nothing starts a new selection.
 *
 * @param view The canvas of the walkable view.
 * @param gesture The modifiers of the gesture, and how many clicks it holds.
 */
export async function clickCrosshair(view: Locator, gesture: SelectionGesture = {}): Promise<void> {
  await view.evaluate((canvas, given) => {
    const box = canvas.getBoundingClientRect()
    const halfWidth = box.width / 2
    const halfHeight = box.height / 2
    const place = { clientX: box.left + halfWidth, clientY: box.top + halfHeight }

    function make(type: string): MouseEvent {
      return new MouseEvent(type, {
        ...place,
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        shiftKey: given.shift === true,
        ctrlKey: given.ctrl === true,
      })
    }

    const clicks = given.clicks ?? 1

    for (let index = 0; index < clicks; index = index + 1) {
      canvas.dispatchEvent(make('mousedown'))
      canvas.dispatchEvent(make('mouseup'))
    }

    if (clicks > 1) {
      canvas.dispatchEvent(make('dblclick'))
    }
  }, gesture)

  // the press and the pick of the double click run on the next frame, and the statistics follows the selection
  // a tick later; there is no event of the editor to wait for (a gesture that changes nothing emits none)
  await view.page().waitForTimeout(400)
}

/**
 * The six fields of the camera form, in the order the widget shows them.
 */
const CAMERA_FIELDS = ['x', 'y', 'z', 'pitch', 'yaw', 'roll'] as const

/**
 * The text of the six fields of the camera form.
 */
export type CameraPoseFields = Record<(typeof CAMERA_FIELDS)[number], string>

/**
 * Reads the pose the camera form shows.
 *
 * @remarks
 * The form is filled from the camera store, so before the walkable view reports anything it shows the spawn of
 * the level: a test reads it there, and puts it back after a real click turned the camera (see {@link writePose}).
 *
 * @param page The page to read.
 *
 * @returns The text of the six fields.
 */
export async function readPose(page: Page): Promise<CameraPoseFields> {
  const pose: Partial<CameraPoseFields> = {}

  for (const field of CAMERA_FIELDS) {
    pose[field] = await page.locator(`#camera-${field}`).inputValue()
  }

  return pose as CameraPoseFields
}

/**
 * Moves the walkable camera by writing its pose into the camera form.
 *
 * @remarks
 * The gesture that takes the pointer lock is a real click, and chromium reports a movement with it (it moves the
 * cursor into the middle of the locked element), so the camera turns: a test that needs a known aim writes the
 * pose back here. The form applies the pose on every input, so the fields are the way in — and a field needs no
 * mouse, which is what a pointer lock takes away. The last field is blurred at the end: a focused input puts the
 * keyboard into its typing mode, where `Delete` and the other keys of the editor do nothing.
 *
 * @param page The page to write into.
 * @param pose The text of the six fields.
 */
export async function writePose(page: Page, pose: CameraPoseFields): Promise<void> {
  for (const field of CAMERA_FIELDS) {
    const input = page.locator(`#camera-${field}`)

    // the roll is disabled: the camera has no roll, and a disabled input takes no text
    if (await input.isDisabled()) {
      continue
    }

    await input.fill(pose[field])
  }

  // every field is blurred, not just the first one: `fill` leaves the last field it wrote focused, and a
  // focused input puts the keyboard into its typing mode, where the keys of the editor do nothing
  for (const field of CAMERA_FIELDS) {
    const input = page.locator(`#camera-${field}`)

    if (await input.isDisabled()) {
      continue
    }

    await input.evaluate((element) => {
      element.blur()
    })
  }

  // the pose reaches the view on the input, and the view draws the next frame: a moment for the pick
  await page.waitForTimeout(400)
}

/**
 * Counts the pixels of a canvas that are not the empty background.
 *
 * @param view The canvas to read.
 *
 * @returns The number of lit pixels.
 */
export async function litPixels(view: Locator): Promise<number> {
  const shot = await view.screenshot()

  return await view.page().evaluate(async (base64) => {
    const image = new Image()

    image.src = `data:image/png;base64,${base64}`
    await image.decode()

    const surface = document.createElement('canvas')

    surface.width = image.width
    surface.height = image.height

    const context = surface.getContext('2d')

    if (context === null) {
      return 0
    }

    context.drawImage(image, 0, 0)

    const { data } = context.getImageData(0, 0, image.width, image.height)
    let count = 0

    for (let index = 0; index < data.length; index = index + 4) {
      if (data[index] + data[index + 1] + data[index + 2] > 90) {
        count = count + 1
      }
    }

    return count
  }, shot.toString('base64'))
}
