import { Buffer } from 'node:buffer'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'

/**
 * The levels the e2e opens from the fixture data dir.
 *
 * @remarks
 * A level of the game is a **map** of the list now (`?map=arx-fatalis-level-8`), and a map opens only when the data
 * dir of the game has it (`?fromOriginalArxLevel` was the old api, and it is gone, 2026-11-23, the owner). The suite
 * therefore brings its own small folder: level 8 is the default one of the specs, level 0 has the hundreds of lights,
 * and level 12 the portal and room cases.
 */
export const FIXTURE_LEVELS = [0, 8, 12] as const

/**
 * The folder of the fixture data dir the e2e opens the levels from.
 *
 * @remarks
 * It lives in the output folder of the run, which the runner empties before the tests: the setup below writes the three
 * files of every level into it, and a spec only builds the url that names it. The path is absolute, because the
 * development server reads the files of the disk through its `?dataDir=` route.
 */
export const LEVEL_FIXTURE_DIR = fileURLToPath(new URL('../../../test-results/level-data', import.meta.url))

/**
 * The models the fixture data dir carries, under the paths of the data directory.
 *
 * @remarks
 * The editor draws the player of a level from the game's `human_base` model, and the models of the entities come later
 * (TODO 235): a spec that touches the model of the spawn needs the file in the data dir. The folder holds a handful of
 * the game's own FTLs, one of every kind of the interactive objects (an npc, a fixed interactive, an item, a system
 * marker), **as the data directory keeps them** (the packed form — the loader unpacks an FTL that is not plain).
 */
const MODEL_FIXTURE_DIR = fileURLToPath(new URL('../fixtures/models', import.meta.url))

/**
 * A model the fixture data dir carries, by its path inside the model folder.
 */
export const FIXTURE_MODELS = [
  'graph/obj3d/interactive/fix_inter/door_double_throne/door_double_throne.ftl',
  'graph/obj3d/interactive/fix_inter/light_door/light_door.ftl',
  'graph/obj3d/interactive/items/movable/jar/jar.ftl',
  'graph/obj3d/interactive/items/movable/mug/mug.ftl',
  'graph/obj3d/interactive/npc/human_base/human_base.ftl',
  'graph/obj3d/interactive/npc/rat_base/rat_base.ftl',
  'graph/obj3d/interactive/system/marker/marker.ftl',
] as const

/**
 * Writes the three files of every level of {@link FIXTURE_LEVELS} into {@link LEVEL_FIXTURE_DIR}.
 *
 * @remarks
 * The bytes come from the development server's local level route (`/__local-levels`), which reads the checkout of the
 * `pkware-test-files` repository next to the editor or its cache, and downloads a level only when neither has it. The
 * route is a dev-only plugin of the server (the tests do not need the game or the network), and it is started before
 * this setup: the web server is a plugin, and the plugins are set up before the global setups.
 *
 * @param config The configuration of the run, whose first project carries the base url of the server.
 *
 * @throws `Error` when the route has no level, or the URL of the run has no base.
 */
export default async function setup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL

  if (baseURL === undefined) {
    throw new Error('The run has no base url: the fixture data dir can not be built.')
  }

  for (const level of FIXTURE_LEVELS) {
    const folder = join(LEVEL_FIXTURE_DIR, 'graph', 'levels', `level${String(level)}`)

    await mkdir(folder, { recursive: true })

    for (const name of [`level${String(level)}.dlf`, 'fast.fts', `level${String(level)}.llf`]) {
      const url = new URL(`/__local-levels/arx-fatalis/level${String(level)}/${name}`, baseURL)
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`The local level route has no ${url.href}: ${String(response.status)} ${response.statusText}`)
      }

      await writeFile(join(folder, name), Buffer.from(await response.arrayBuffer()))
    }
  }

  // the models of the game, under the paths the data directory keeps them at: the packed files of the fixtures are
  // what the loader reads (and unpacks), and the specs of the spawn and of the entities find them where the game has them
  await cp(MODEL_FIXTURE_DIR, LEVEL_FIXTURE_DIR, { recursive: true })
}
