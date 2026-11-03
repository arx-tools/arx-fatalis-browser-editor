import { ArxMap } from '../../../generator/ArxMap.ts'
import { Settings } from '../../../generator/Settings.ts'
import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../persistedRef/url.ts'
import { createBlankLevelFiles, FLAT_PRESET, type NewLevelPreset } from './blankLevel.ts'
import { dataDirFromUrl, readDataFile } from './dataDir.ts'
import { createZipUrlLevelSource } from './zipSource.ts'
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
 * The url parameter that opens one of the original levels of the game.
 *
 * @remarks
 * The url is the **api** of the editor: everything the editor can do with the level is a parameter of it, and a
 * link is the whole state. This one is the level itself, beside the seed, the camera pose and the visibility
 * switches — so a test (and a person) can open level 8 without touching the code.
 *
 * It is not called `level` because a level is not only a number here: the editor opens a level from one of three
 * sources ({@link LevelSource}), and this parameter is the **original game level** of one of them.
 */
export const ORIGINAL_LEVEL_PARAMETER = 'fromOriginalArxLevel'

/**
 * The original level the url asks for.
 *
 * @remarks
 * The original levels of the game are numbered from 0, so a value that is not a whole number in that range is
 * ignored (the editor opens a blank level then): a mistyped link is not a reason to fail a load.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The level of the url, or undefined when it says nothing usable.
 */
export function originalLevelFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): number | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, ORIGINAL_LEVEL_PARAMETER)

  // an empty parameter (`?fromOriginalArxLevel=`) is not level 0: it says nothing
  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  const level = Number(raw)

  if (!Number.isSafeInteger(level) || level < 0) {
    return undefined
  }

  return level
}

/**
 * The url parameter that opens a level from a zip.
 *
 * @remarks
 * The sibling of {@link ORIGINAL_LEVEL_PARAMETER}: the level of the session is not one of the game's own, but a zip
 * somewhere the browser (or the development server) can read. A hand test is one url then: paste the path of the zip
 * in the address bar, and the editor opens it.
 */
export const ZIP_URL_PARAMETER = 'fromZip'

/**
 * The url of the zip the url asks for.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The url of the zip, or undefined when the url says nothing usable.
 */
export function zipUrlFromUrl(url: UrlAdapter | undefined = getUrlAdapter(undefined)): string | undefined {
  if (url === undefined) {
    return undefined
  }

  const raw = readUrlValue(url, ZIP_URL_PARAMETER)

  if (raw === undefined || raw.trim() === '') {
    return undefined
  }

  return raw.trim()
}

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
 * Reads the three files of a level from the data directory of the game.
 *
 * @remarks
 * The folder of a level holds `fast.fts` (the scene) beside `level<N>.dlf` and `level<N>.llf`, under `graph/levels`
 * ({@link DATA_DIR_PREFIXES} carries the shapes a copy of the game may keep them in).
 *
 * @param dataDir The folder of the game's data.
 * @param level The number of the level.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The three files, ready for the generator.
 *
 * @throws When the folder has no such level: a level named by the url is not silently a blank one.
 */
export async function fetchDataDirLevelFiles(
  dataDir: string,
  level: number,
  fetchImpl: typeof fetch = fetch,
): Promise<LevelFiles> {
  const names = levelFileNames(level)
  const folder = `graph/levels/level${String(level)}`
  const [dlf, fts, llf] = await Promise.all([
    readDataFile(`${folder}/${names.dlf}`, fetchImpl, undefined, dataDir),
    readDataFile(`${folder}/${names.fts}`, fetchImpl, undefined, dataDir),
    readDataFile(`${folder}/${names.llf}`, fetchImpl, undefined, dataDir),
  ])

  if (dlf === undefined || fts === undefined || llf === undefined) {
    throw new Error(`The data directory ${dataDir} has no level ${String(level)}.`)
  }

  return { dlf, fts, llf }
}

/**
 * Where a level of the game comes from, and which one it is.
 */
export interface OriginalLevelSource extends LevelSource {
  /**
   * The number of the level, from 0.
   */
  readonly level: number
}

/**
 * Tells whether a source is one of the original levels of the game.
 *
 * @param source The source of a level.
 *
 * @returns True for the sources of {@link OriginalLevelSource}.
 */
export function isOriginalLevelSource(source: LevelSource): source is OriginalLevelSource {
  return 'level' in source
}

/**
 * The source of one of the original levels of the game.
 *
 * @param level The number of the level.
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The source, which downloads the three files of that level.
 */
export function createOriginalLevelSource(
  level: number,
  url: UrlAdapter | undefined = getUrlAdapter(undefined),
): OriginalLevelSource {
  // the folder is read **now**: the url does not keep the parameter (the editor takes it out of the address bar after
  // the start, and the source loads later)
  const dataDir = dataDirFromUrl(url)

  return {
    label: `Level ${String(level)}`,
    level,
    load: async (fetchImpl: typeof fetch = fetch): Promise<LevelFiles> => {
      // the data directory of the url is the game's own folder: the files are read from there, no network
      if (dataDir === undefined) {
        return await fetchLevelFiles(level, fetchImpl)
      }

      return await fetchDataDirLevelFiles(dataDir, level, fetchImpl)
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
export async function loadOriginalArxLevel(level: number, fetchImpl: typeof fetch = fetch): Promise<ArxMap> {
  return await loadLevel(createOriginalLevelSource(level), fetchImpl)
}

/**
 * Where the editor takes the level it opens from: the zip of the url, the original level of the url, or a blank one.
 *
 * @remarks
 * The editor opens **no level by default**: with nothing in the url it starts from a blank level of the `Flat`
 * preset, which is a floor to build on rather than a level of the game to look at. A link that names an original
 * level opens that one — the url is the api, and this is the parameter of it which chooses what is loaded. The zip
 * comes first: it is the most specific thing a link can name, and the two parameters together are a mistake the zip
 * side wins.
 *
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The source of the level of the session.
 */
export function starterLevelSource(url: UrlAdapter | undefined = getUrlAdapter(undefined)): LevelSource {
  const zipUrl = zipUrlFromUrl(url)

  if (zipUrl !== undefined) {
    return createZipUrlLevelSource(zipUrl)
  }

  const level = originalLevelFromUrl(url)

  if (level === undefined) {
    return createBlankLevelSource(FLAT_PRESET)
  }

  return createOriginalLevelSource(level, url)
}

/**
 * Builds the level the editor opens.
 *
 * @remarks
 * A level of the game that does not load is **not an error**: the editor opens a blank one instead, so a link with
 * a level that is not on the server (or a download that fails) still gives something to work with. The user is not
 * told about it yet — the toast of the persistence problems (TODO 66) will carry that message.
 *
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The built map of the level of the session.
 */
export async function loadStarterLevel(
  fetchImpl: typeof fetch = fetch,
  url: UrlAdapter | undefined = getUrlAdapter(undefined),
): Promise<ArxMap> {
  const source = starterLevelSource(url)
  const named = dataDirFromUrl(url)

  // a level the url names in a data directory is read from the disk: a folder that has no such level is a mistake of
  // the url, and the walkable view shows it instead of a silent blank level
  if (named !== undefined && originalLevelFromUrl(url) !== undefined) {
    return await loadLevel(source, fetchImpl)
  }

  try {
    return await loadLevel(source, fetchImpl)
  } catch {
    return await loadLevel(createBlankLevelSource(FLAT_PRESET))
  }
}
