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
      return await list.locator('.AccordionRow').count()
    })
    .toBe(5)

  // the total of the level sits in the heading, on the right
  await expect(list.locator('.total')).toHaveText(/^Total: \d+$/u)

  const totalText = await list.locator('.total').innerText()
  const total = Number(/\d+/.exec(totalText)?.[0] ?? 0)

  expect(total).toBeGreaterThan(0)

  // the five folders of the game are the rows, all of them closed to start with
  await expect(list.locator('.AccordionRow')).toHaveCount(5)

  for (const category of ['items', 'npc', 'system']) {
    await expect(list.locator('.AccordionRow', { hasText: category }).locator('.head')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  }

  // the two folders level 8 holds nothing in (the fixed ones and the player): their rows do not fold, and the dash
  // takes the place of the arrow
  for (const category of ['fix_inter', 'player']) {
    const row = list.locator('.AccordionRow', { hasText: category })

    await expect(row.locator('.head')).not.toHaveAttribute('aria-expanded')
    await expect(row.locator('.dash')).toHaveCount(1)
    await expect(row.locator('.chevron')).toHaveCount(0)
  }

  await list.locator('.AccordionRow', { hasText: 'player' }).locator('.head').click()
  await expect(list.locator('.row')).toHaveCount(0)

  // opening a row shows its entities, and the arrow says it (the level 8 has items, npcs and system objects, and no
  // fixed one)
  const itemsRow = list.locator('.AccordionRow', { hasText: 'items' })

  await itemsRow.locator('.head').click()

  await expect(itemsRow.locator('.head')).toHaveAttribute('aria-expanded', 'true')
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

  expect(await list.locator('.row').count()).toBeGreaterThan(0)

  // nothing matches: the list says so, and the count goes to zero
  await list.getByRole('searchbox', { name: 'Search entities' }).fill('no-such-entity')

  await expect(list.locator('.row')).toHaveCount(0)
  await expect(list).toContainText('No entity matches the search.')
})
