import { ArxMap } from '../../../generator/ArxMap.ts'
import { Settings } from '../../../generator/Settings.ts'
import { createBlankLevelFiles, type NewLevelPreset } from './blankLevel.ts'
import { levelSeed } from './seed.ts'

/**
 * The three packed files a level is made of.
 *
 * @remarks
 * Every source of a level (the original files of the game, a zip from the browser, a blank level made here) gives
 * these three, in the same packed form the game stores them in, so what comes after is the same for all of them.
 */
export interface LevelFiles {
  /**
   * The description of the level: the player, the interactive objects, the fog, the zones and the paths.
   */
  readonly dlf: ArrayBuffer
  /**
   * The scene: the polygons, the texture containers, the anchors, the portals and the rooms.
   */
  readonly fts: ArrayBuffer
  /**
   * The lighting: the lights and their colours.
   */
  readonly llf: ArrayBuffer
}

/**
 * Where a level comes from.
 */
export interface LevelSource {
  /**
   * What the source is, for a later picker and the error messages: `Level 11`, `Blank level`, a zip name.
   */
  readonly label: string
  /**
   * Produces the three files of the level.
   *
   * @remarks
   * A source that makes its files here answers at once, one that downloads them answers when they arrive: both
   * shapes are allowed, so the caller awaits either way.
   *
   * @param fetchImpl The fetch to use, so a test hands in a fake one.
   *
   * @returns The three packed files.
   */
  readonly load: (fetchImpl?: typeof fetch) => LevelFiles | Promise<LevelFiles>
}

/**
 * Where the packed level files are downloaded from.
 *
 * @remarks
 * The `pkware-test-files` repository holds the levels of the game unpacked from the PAKs, still with
 * their inner compression. It is the same source the archived editor used, and it keeps the repository
 * free of multi megabyte binaries.
 */
const LEVEL_FILES_BASE_URL = 'https://raw.githubusercontent.com/arx-tools/pkware-test-files/main/arx-fatalis'

/**
 * The level the editor opens today.
 *
 * @remarks
 * Hardcoded on purpose: the level picker is a later round, and one fixed level is enough to see whether
 * the pipeline works.
 *
 * The constant itself is temporary. Opening a level rewrites this whole part (where the bytes come from, the
 * picker, the url), and the constant goes with it. Until then it is the switch of the testing rounds: the
 * number is changed whenever a round needs another level, so neither 8 nor 11 is a fixed value — whichever
 * level the current round works on is the right one here.
 */
export const STARTER_LEVEL = 1

/**
 * The names of the three files of a level.
 *
 * @param level The number of the level.
 *
 * @returns The file name of each of the three formats.
 */
export function levelFileNames(level: number): { dlf: string; fts: string; llf: string } {
  return { dlf: `level${level}.dlf`, fts: 'fast.fts', llf: `level${level}.llf` }
}

/**
 * The urls of the three files of a level.
 *
 * @param level The number of the level.
 *
 * @returns The url of each of the three formats.
 */
export function levelFileUrls(level: number): { dlf: string; fts: string; llf: string } {
  const names = levelFileNames(level)
  const base = `${LEVEL_FILES_BASE_URL}/level${level}`

  return { dlf: `${base}/${names.dlf}`, fts: `${base}/${names.fts}`, llf: `${base}/${names.llf}` }
}

/**
 * Downloads one file.
 *
 * @param url The url to read.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The bytes of the file.
 *
 * @throws When the response is not ok.
 */
async function fetchFile(url: string, fetchImpl: typeof fetch): Promise<ArrayBuffer> {
  const response = await fetchImpl(url)

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${String(response.status)} ${response.statusText}`)
  }

  return await response.arrayBuffer()
}

/**
 * Downloads the three packed files of a level.
 *
 * @param level The number of the level.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The three files, ready for the generator.
 */
export async function fetchLevelFiles(
  level: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ dlf: ArrayBuffer; fts: ArrayBuffer; llf: ArrayBuffer }> {
  const urls = levelFileUrls(level)
  const [dlf, fts, llf] = await Promise.all([
    fetchFile(urls.dlf, fetchImpl),
    fetchFile(urls.fts, fetchImpl),
    fetchFile(urls.llf, fetchImpl),
  ])

  return { dlf, fts, llf }
}

/**
 * The source of one of the original levels of the game.
 *
 * @param level The number of the level.
 *
 * @returns The source, which downloads the three files of that level.
 */
export function createOriginalLevelSource(level: number): LevelSource {
  return {
    label: `Level ${String(level)}`,
    load: async (fetchImpl: typeof fetch = fetch): Promise<LevelFiles> => {
      return await fetchLevelFiles(level, fetchImpl)
    },
  }
}

/**
 * The source of a blank level: an empty level with one quad under the feet of the player.
 *
 * @returns The source, which builds the three files here and needs no network.
 */
export function createBlankLevelSource(preset?: NewLevelPreset): LevelSource {
  return {
    label: 'Blank level',
    load: (): LevelFiles => {
      return createBlankLevelFiles(preset)
    },
  }
}

/**
 * Builds the map of a level from its source.
 *
 * @remarks
 * It is the one place a level is made: the seed of the level goes in, and the seed the level made for itself comes
 * back into the ref (so a level that had no seed comes back with the same one on a reload).
 *
 * @param source Where the files come from.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The built map of that level.
 */
export async function loadLevel(source: LevelSource, fetchImpl?: typeof fetch): Promise<ArxMap> {
  const files = await source.load(fetchImpl)

  // what the level is made with: the seed today, and whatever a level needs later (the lighting mode, the
  // level it comes from), so this stays the one place to build it
  const settings = new Settings({ seed: levelSeed.value })
  const map = new ArxMap(files.dlf, files.fts, files.llf, settings)

  // the level made its own seed when it had none: the ref writes it in the url, so the level comes back
  levelSeed.value = map.settings.seed

  return map
}

/**
 * Downloads and builds one of the original levels of the game.
 *
 * @param level The number of the level.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The built map of that level.
 */
export async function loadOriginalArxLevel(
  level: number = STARTER_LEVEL,
  fetchImpl: typeof fetch = fetch,
): Promise<ArxMap> {
  return await loadLevel(createOriginalLevelSource(level), fetchImpl)
}
