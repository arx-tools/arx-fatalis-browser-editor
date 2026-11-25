import { expect, test } from '@playwright/test'
import { testLayout } from '../support/layouts.ts'
import { WIDGET_KINDS } from '../../src/editor/modules/layout/widgetKinds.ts'
import { editorUrl, renameKinds, seedLayout, waitForLayoutSettled, waitForLevel } from './support/editor.ts'

/**
 * The entity list: the interactive objects of the DLF, by category, with a search.
 *
 * @remarks
 * The first slice of TODO 239: the Entities preset holds the list in its right column (the owner's choice: in place of
 * the room inspector), the rows are the entities of the level, and the search reads their name and their identifier. The
 * pick and the transform of an entity come with TODO 240, so the rows are read only.
 */
test('the entity list shows the entities of the level, and the search filters them', async ({ page }) => {
  // the level comes over the network, the way the deployed editor downloads it
  test.setTimeout(120_000)

  await page.goto(editorUrl())

  await expect(page.locator('.lm-DockPanel-widget').first()).toBeVisible()

  // the entity work has a layout of its own: the preset puts the list in the right column (and the statistics the wait
  // for the level reads)
  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Entities' }).click()

  const list = page.locator('[data-widget-kind="entity-list"]')

  await expect(list).toBeVisible()

  // the level 8 of the game carries interactive objects, and the list fills as the level arrives (the layout has no
  // statistics widget to wait on: the list itself is the signal). The first row is the **player** of the level, the
  // spawn, which every level has: the four folders of the entities come after it
  await expect
    .poll(async () => {
      return await list.locator('.AccordionRow').count()
    })
    .toBe(5)

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')

  // the player starts folded away, the way the folders do: its row is there when the author opens it
  const playerRow = list.locator('.player-row')

  await expect(playerRow).toHaveCount(0)
  await list.locator('.AccordionRow').first().locator('.head').click()
  await expect(playerRow).toHaveCount(1)

  // the row of the player is the spawn of the level: it is clickable, and it says it is picked (TODO 172)
  await expect(playerRow).toHaveAttribute('data-selected', 'false')
  await expect(playerRow.locator('.name')).toHaveText('spawn')
  await playerRow.locator('.name').click()
  await expect(playerRow).toHaveAttribute('data-selected', 'true')
  await playerRow.locator('.name').click()
  await expect(playerRow).toHaveAttribute('data-selected', 'false')

  // the total of the level sits in the heading, on the right
  await expect(list.locator('.total')).toHaveText(/^Total: \d+$/u)

  const totalText = await list.locator('.total').innerText()
  const total = Number(/\d+/.exec(totalText)?.[0] ?? 0)

  expect(total).toBeGreaterThan(0)

  // the player, and the four folders the game places entities from; the folders start closed
  await expect(list.locator('.AccordionRow')).toHaveCount(5)

  for (const category of ['items', 'npc', 'system']) {
    await expect(list.locator('.AccordionRow', { hasText: category }).locator('.head')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  }

  // the fixed folder level 8 holds nothing in: its row does not fold, and the dash takes the place of the arrow
  const fixedRow = list.locator('.AccordionRow', { hasText: 'fix_inter' })

  await expect(fixedRow.locator('.head')).not.toHaveAttribute('aria-expanded')
  await expect(fixedRow.locator('.dash')).toHaveCount(1)
  await expect(fixedRow.locator('.chevron')).toHaveCount(0)

  await fixedRow.locator('.head').click()
  await expect(list.locator('.row:not(.player-row)')).toHaveCount(0)

  // opening a row shows its entities, and the arrow says it (the level 8 has items, npcs and system objects, and no
  // fixed one)
  const itemsRow = list.locator('.AccordionRow', { hasText: 'items' })

  await itemsRow.locator('.head').click()

  await expect(itemsRow.locator('.head')).toHaveAttribute('aria-expanded', 'true')
  await expect
    .poll(async () => {
      return await list.locator('.row:not(.player-row)').count()
    })
    .toBeGreaterThan(0)

  const rows = await list.locator('.row:not(.player-row)').count()

  expect(rows).toBeGreaterThan(0)

  // a click picks the entity of the row, and a second one lets it go: the same selection the markers of the view write
  const firstRow = list.locator('.row:not(.player-row)').first()

  await expect(firstRow).toHaveAttribute('data-selected', 'false')
  await firstRow.locator('.name').click()
  await expect(firstRow).toHaveAttribute('data-selected', 'true')

  // `C` clears the selection of the view: the faces, the lights and the entities together
  await page.keyboard.press('c')

  await expect(firstRow).toHaveAttribute('data-selected', 'false')

  // the jump at the end of a row takes the camera to the entity: the pose of the camera is in the url, so the move is
  // the parameter it writes (the layout has no camera form to read)
  function positionOf(url: string): string | undefined {
    return new URL(url).searchParams.get('position') ?? undefined
  }

  const spawnPosition = positionOf(page.url())

  await list.locator('.row:not(.player-row) .jump').first().click()

  await expect
    .poll(() => {
      return positionOf(page.url())
    })
    .not.toBe(spawnPosition)

  // the search keeps what the name matches, opens the sections it found, and the count says how much of the level is
  // left (the level 8 has human_base entities among its npcs)
  await list.getByRole('searchbox', { name: 'Search entities' }).fill('human')

  await expect
    .poll(async () => {
      return await list.locator('.row:not(.player-row)').count()
    })
    .toBeLessThan(total)

  expect(await list.locator('.row:not(.player-row)').count()).toBeGreaterThan(0)

  // nothing matches: the list says so, and the count goes to zero
  await list.getByRole('searchbox', { name: 'Search entities' }).fill('no-such-entity')

  await expect(list.locator('.row:not(.player-row)')).toHaveCount(0)
  await expect(list).toContainText('No entity matches the search.')
})

/**
 * The list finds the entity a pick left in the store, even when the widget arrives after the pick.
 *
 * @remarks
 * The owner asked for a picked entity to stand on the screen of the list (2026-11-24): the row of its folder is open, and
 * the list scrolls to it. The pick here is a row of the list (the click writes the same store the markers of the walkable
 * view write), and the widget arrives again on a preset switch: the list keeps no state of its own, so the reveal has to
 * read the selection and the level when it mounts. The box of the list is the small one of the editor layout, so the last
 * row of a folder is under its fold, and the reveal scrolls the folder to the row.
 */
test('the list opens the folder of the entity it arrives with, and scrolls to the row', async ({ page }) => {
  test.setTimeout(120_000)

  await page.setViewportSize({ width: 1631, height: 850 })
  // the editor layout with the entity list in the place of the polygon inspector: the box of the list is 180 px high
  await seedLayout(page, renameKinds(testLayout, { [WIDGET_KINDS.polygonInspector]: WIDGET_KINDS.entityList }))
  await page.goto(editorUrl())
  await waitForLevel(page)
  await waitForLayoutSettled(page)

  const list = page.locator('[data-widget-kind="entity-list"]')

  await expect(list.locator('.AccordionRow').first()).toContainText('Player')

  // the folder of the items, and its last row: the row is under the fold of the small box, and a click picks the entity
  const itemsRow = list.locator('.AccordionRow', { hasText: 'items' })

  await itemsRow.locator('.head').click()

  const rows = itemsRow.locator('.row')

  await expect(rows.last()).toBeVisible()

  const pickedRow = rows.last()
  const index = await pickedRow.getAttribute('data-entity-index')

  await pickedRow.click()
  await expect(pickedRow).toHaveAttribute('data-selected', 'true')

  // the folder folds away, and the widget arrives again with the pick still in the store: another preset, then back
  await itemsRow.locator('.head').click()
  await expect(itemsRow.locator('.head')).toHaveAttribute('aria-expanded', 'false')

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Lighter' }).click()
  await waitForLayoutSettled(page)
  await expect(page.locator('[data-widget-kind="entity-list"]')).toHaveCount(0)

  await page.locator('header button[aria-label="Presets"]').click()
  await page.locator('.preset-menu .preset-row', { hasText: 'Editor' }).click()
  await waitForLayoutSettled(page)

  const reopened = page.locator('[data-widget-kind="entity-list"]')
  const reopenedItems = reopened.locator('.AccordionRow', { hasText: 'items' })

  await expect(reopenedItems.locator('.head')).toHaveAttribute('aria-expanded', 'true')

  const picked = reopened.locator('.row[data-selected="true"]')

  await expect(picked).toHaveCount(1)
  await expect(picked).toHaveAttribute('data-entity-index', index ?? '')
  await expect(picked).toBeVisible()

  // the row was under the fold, so the reveal scrolled the box of the folders to it
  const folders = reopened.locator('.sections')

  await expect
    .poll(async () => {
      return await folders.evaluate((node) => {
        return node.scrollTop
      })
    })
    .toBeGreaterThan(0)
})
