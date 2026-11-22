import { expect, test } from '@playwright/test'
import { editorUrl } from './support/editor.ts'

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
  // statistics widget to wait on: the list itself is the signal)
  await expect
    .poll(async () => {
      return await list.locator('.section').count()
    })
    .toBe(5)

  await expect(list.locator('.count')).toContainText('entit')

  // the count line says how many the whole level holds, which the search narrows down below
  const countText = await list.locator('.count').innerText()
  const total = Number(/\d+/.exec(countText)?.[0] ?? 0)

  // the five folders of the game are the sections, all of them closed to start with
  await expect(list.locator('.section-head')).toHaveCount(5)

  for (const category of ['fix_inter', 'items', 'npc', 'player', 'system']) {
    await expect(list.locator('.section-head', { hasText: category })).toHaveAttribute('aria-expanded', 'false')
  }

  await expect(list.locator('.row')).toHaveCount(0)

  // opening a section shows its rows, and the arrow says it (the level 8 has items, npcs and system objects, and no
  // fixed one)
  const itemsSection = list.locator('.section-head', { hasText: 'items' })

  await itemsSection.click()

  await expect(itemsSection).toHaveAttribute('aria-expanded', 'true')
  await expect
    .poll(async () => {
      return await list.locator('.row').count()
    })
    .toBeGreaterThan(0)

  const rows = await list.locator('.row').count()

  expect(rows).toBeGreaterThan(0)

  // the search keeps what the name matches, opens the sections it found, and the count says how much of the level is
  // left (the level 8 has human_base entities among its npcs)
  await list.getByRole('searchbox', { name: 'Search entities' }).fill('human')

  await expect
    .poll(async () => {
      return await list.locator('.row').count()
    })
    .toBeLessThan(total)

  await expect(list.locator('.count')).toContainText(`of ${String(total)} entities`)
  expect(await list.locator('.row').count()).toBeGreaterThan(0)

  // nothing matches: the list says so, and the count goes to zero
  await list.getByRole('searchbox', { name: 'Search entities' }).fill('no-such-entity')

  await expect(list.locator('.row')).toHaveCount(0)
  await expect(list).toContainText('No entity matches the search.')
})
