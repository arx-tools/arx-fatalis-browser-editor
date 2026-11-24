import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

/**
 * The keys as a popup (TODO 187).
 *
 * @remarks
 * The key help is a widget of the dock, and a layout may not hold it (a preset of the author, the `Blank` one): `H` opens
 * the same list as a dialog over the editor, wherever the author is, and the `X` of the dialog, `Escape` or a click on
 * the cover put it away. The list of the dialog reads the modules of the editor, so its eyes and its buttons work as the
 * ones of the dock do.
 */
test('H opens the keys as a popup, and the dialog closes the ways the other dialogs do', async ({ page }) => {
  await page.goto(editorUrl())

  // the `H` of the test is a key of the running editor: a press before the dock is built is a press nobody heard
  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  const dialog = page.locator('.Modal .dialog[aria-label="Keyboard Shortcuts"]')

  await expect(page.getByText('Arx Fatalis Browser Editor')).toBeVisible()
  await expect(dialog).toHaveCount(0)

  await page.keyboard.press('h')

  await expect(dialog).toBeVisible()
  // the list of the dock is inside the dialog, without a heading of its own: the title of the dialog is the heading
  await expect(dialog.locator('[data-widget-kind]')).toHaveCount(0)
  await expect(dialog.locator('.WidgetHeading')).toHaveCount(0)
  await expect(dialog.locator('section')).not.toHaveCount(0)
  await expect(dialog).toContainText('Transform')

  // `H` again puts it away
  await page.keyboard.press('h')

  await expect(dialog).toHaveCount(0)

  // the `X` of the dialog
  await page.keyboard.press('h')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: 'Close' }).click()

  await expect(dialog).toHaveCount(0)

  // `Escape`
  await page.keyboard.press('h')
  await expect(dialog).toBeVisible()

  await page.keyboard.press('Escape')

  await expect(dialog).toHaveCount(0)
})

/**
 * The rows of the popup are the switches of the editor, not a copy of them.
 *
 * @remarks
 * The list reads the modules (`editModes`, `levelDisplay`, the history), so the eye of the dialog flips the same switch
 * the key of the mode does, and the dock widget shows it the next time it is on the screen.
 */
test('the eye of the popup flips the switch of the mode', async ({ page }) => {
  await page.goto(editorUrl())
  // the keyboard of the editor starts with its dock: a press before that is a press nobody heard
  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  await page.keyboard.press('h')

  const dialog = page.locator('.Modal .dialog[aria-label="Keyboard Shortcuts"]')
  const rotateEye = dialog.locator('button[aria-label="Show the rotate gizmo"]')

  await expect(rotateEye).toHaveAttribute('aria-pressed', 'false')

  await rotateEye.click()

  await expect(dialog.locator('button[aria-label="Hide the rotate gizmo"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(dialog.locator('button[aria-label="Show the transform gizmo"]')).toHaveAttribute('aria-pressed', 'false')
})

test('the textures sit under the mesh, and the T of the help flips them', async ({ page }) => {
  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  await page.keyboard.press('h')

  const dialog = page.locator('.Modal .dialog[aria-label="Keyboard Shortcuts"]')

  await expect(dialog).toBeVisible()

  // the three switches under the mesh, in the order the owner asked for: portals, rooms, textures
  const actions = dialog.locator('dd .action')
  const meshAt = await actions.evaluateAll((nodes) => {
    return nodes.map((node) => {
      return node.textContent?.trim() ?? ''
    })
  })

  expect(meshAt.slice(meshAt.indexOf('Mesh'), meshAt.indexOf('Mesh') + 4)).toEqual([
    'Mesh',
    'Portals',
    'Rooms',
    'Textures',
  ])

  // the textures start on, and the row says so
  const textures = dialog.getByRole('button', { name: 'Hide the textures' })

  await expect(textures).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('t')

  const hidden = dialog.getByRole('button', { name: 'Show the textures' })

  await expect(hidden).toHaveAttribute('aria-pressed', 'false')

  // without the mesh the switch has nothing to draw on: a press of the T keeps its value
  await page.keyboard.press('m')
  await page.keyboard.press('t')

  // the row of a switch under the mesh says why it can not be flipped: the mesh is off
  const blocked = dialog.locator('dd', { hasText: 'Textures' }).getByRole('button')

  await expect(blocked).toBeDisabled()
  await expect(blocked).toHaveAttribute('aria-pressed', 'false')
  await expect(blocked).toHaveAttribute('aria-label', 'the mesh is off')
})
