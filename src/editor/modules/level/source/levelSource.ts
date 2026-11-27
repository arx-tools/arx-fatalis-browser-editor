import { ArxMap } from '../../../../generator/ArxMap.ts'
import { Settings } from '../../../../generator/Settings.ts'
import { type LevelFileBuffers, unpackArxFile } from '../../../../generator/files.ts'
import { getUrlAdapter, readUrlValue, type UrlAdapter } from '../../persistedRef/url.ts'
import { createBlankLevelFiles, FLAT_PRESET, type NewLevelPreset } from '../blankLevel.ts'
import { announceProgress, progressOfStep, type LoadProgressHandler } from '../loadProgress.ts'
import { levelSeed } from '../seed.ts'
import { dataDirFromUrl, hasDataDir, readDataFile } from './dataDir.ts'
import { createZipUrlLevelSource } from './zipSource.ts'

/**
 * The three packed files a level is made of.
 *
 * @remarks
 * Every source of a level (the original files of the game, a zip from the browser, a blank level made here) gives
 * these three, in the same packed form the game stores them in, so what comes after is the same for all of them.
 */
export type LevelFiles = {
  /**
   * The description of the level: the player, the interactive objects, the fog, the zones and the paths.
   */
  readonly dlf: ArrayBuffer
  /**
   * The scene: the polygons, the texture containers, the anchors, the portals and the rooms.
   */
  readonly fts: ArrayBuffer
  /**
   * The lighting: the lights and their colors.
   */
  readonly llf: ArrayBuffer
}

/**
 * Where a level comes from.
 */
export type LevelSource = {
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
 * The url parameter that opens a level from a zip.
 *
 * @remarks
 * The level of the session is not one of the game's own, but a zip somewhere the browser (or the development server) can
 * read. A hand test is one url then: paste the path of the zip in the address bar, and the editor opens it. A level of
 * the game is a **map** of the list instead (`?map=arx-fatalis-level-8`), which needs the data directory of the game.
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
/**
 * Reads the three files of a level from the data directory of the session.
 *
 * @param level The number of the level.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param dataDir The folder the url names, or `undefined` when it names none.
 *
 * @returns The three files, or `undefined` when the data directory has none of them.
 *
 * @throws When the data directory has some of the three files but not all of them.
 */
async function levelFilesOfDataDir(
  level: number,
  fetchImpl: typeof fetch,
  dataDir: string | undefined,
): Promise<LevelFiles | undefined> {
  const names = levelFileNames(level)
  const folder = `graph/levels/level${String(level)}`
  const [dlf, fts, llf] = await Promise.all([
    readDataFile(`${folder}/${names.dlf}`, fetchImpl, undefined, dataDir),
    readDataFile(`${folder}/${names.fts}`, fetchImpl, undefined, dataDir),
    readDataFile(`${folder}/${names.llf}`, fetchImpl, undefined, dataDir),
  ])

  if (dlf === undefined && fts === undefined && llf === undefined) {
    return undefined
  }

  if (dlf === undefined || fts === undefined || llf === undefined) {
    throw new Error(`The data directory has no complete level ${String(level)}.`)
  }

  return { dlf, fts, llf }
}

/**
 * Reads the three files of a level from the data directory of the session.
 *
 * @remarks
 * The folder picked in the header (or the remembered handle of the browser) comes first: its files are on the page
 * already, and the level it holds opens without the url. The folder the url names is the fallback. See
 * {@link readDataFile}: the two are read the same way the textures are.
 *
 * @param dataDir The folder the url names, or `undefined` when it names none.
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
  const files = await levelFilesOfDataDir(level, fetchImpl, dataDir)

  if (files === undefined) {
    throw new Error(`The data directory ${dataDir} has no level ${String(level)}.`)
  }

  return files
}

/**
 * Where a level of the game comes from, and which one it is.
 */
export type OriginalLevelSource = LevelSource & {
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
 * @remarks
 * The level comes from the data directory of the game, which is the only source of the original levels: the folder of
 * the header, the remembered one, or the folder the url names. A level without a folder is not downloaded any more
 * (2026-11-23, the owner: the `fromOriginalArxLevel` parameter was the old api, and the map of the list replaced it).
 *
 * @param level The number of the level.
 * @param url The query string to read, the one of the page by default.
 *
 * @returns The source, which reads the three files of that level from the folder of the game.
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
      // the folder picked in the header and the remembered handle come first, then the data directory of the url: a
      // level of the picked folder opens without the url (see `readDataFile`)
      const files = await levelFilesOfDataDir(level, fetchImpl, dataDir)

      if (files !== undefined) {
        return files
      }

      // a data directory the editor has (the picked folder, or the folder of the url) that does not hold the level is
      // a level the editor can not open, and the view says so
      if (dataDir !== undefined || hasDataDir()) {
        throw new Error(`The data directory has no level ${String(level)}.`)
      }

      // no data directory at all: the level of the game has no source, and the notice over the editor asks for the
      // folder (2026-11-12, the owner)
      throw new Error('The level of the game needs the Arx data dir: set the folder of the game, and the level opens.')
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
 * Unpacks the three files of a level, one at a time.
 *
 * @remarks
 * The unpack of the scene is the longest step of a load that runs on the main thread (1.3 s for the 5.3 MB of level 1),
 * so the files go one by one: the cover says which file is on, and the page paints between them. A file that is not
 * compressed (a level made by the editor) comes back as it is, and its step is the paint alone.
 *
 * @param files The three packed files.
 * @param onProgress The reader of the progress, when there is one.
 *
 * @returns The three files, unpacked, for {@link ArxMap}.
 *
 * @throws When a body is not a valid `blast()` stream.
 */
async function unpackLevelFiles(files: LevelFiles, onProgress?: LoadProgressHandler): Promise<LevelFileBuffers> {
  await announceProgress(onProgress, progressOfStep('description'))
  const dlf = unpackArxFile(files.dlf, 'dlf')

  await announceProgress(onProgress, progressOfStep('scene'))
  const fts = unpackArxFile(files.fts, 'fts')

  await announceProgress(onProgress, progressOfStep('lighting'))
  const llf = unpackArxFile(files.llf, 'llf')

  return { dlf, fts, llf }
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
 * @param onProgress The reader of the progress of the load, when the editor has a cover to fill.
 *
 * @returns The built map of that level.
 *
 * @throws When the source can not read its files, or one of them is not a valid Arx file.
 */
export async function loadLevel(
  source: LevelSource,
  fetchImpl?: typeof fetch,
  onProgress?: LoadProgressHandler,
): Promise<ArxMap> {
  await announceProgress(onProgress, progressOfStep('source'))
  const files = await source.load(fetchImpl)
  // the files are unpacked here and not in the map: the unpack is the step the cover says the most about, and it has to
  // give the page a frame between its files
  const unpacked = await unpackLevelFiles(files, onProgress)

  await announceProgress(onProgress, progressOfStep('build'))

  // what the level is made with: the seed today, and whatever a level needs later (the lighting mode, the
  // level it comes from), so this stays the one place to build it
  const settings = new Settings({ seed: levelSeed.value })
  const map = new ArxMap(files.dlf, files.fts, files.llf, settings, unpacked)

  // the level made its own seed when it had none: the ref writes it in the url, so the level comes back
  levelSeed.value = map.settings.seed

  return map
}

/**
 * Where the editor takes the level it opens from: the zip of the url, or a blank one.
 *
 * @remarks
 * The editor opens **no level by default**: with nothing in the url it starts from a blank level of the `Flat` preset,
 * which is a floor to build on rather than a level of the game to look at. A level of the game is a map of the list
 * (`?map=arx-fatalis-level-8`), which needs the data directory; it is not a starter source (2026-11-23, the owner).
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

  return createBlankLevelSource(FLAT_PRESET)
}

/**
 * Builds the level the editor opens.
 *
 * @remarks
 * A source that does not load is **not an error**: the editor opens a blank one instead, so a link with a zip that is
 * not there still gives something to work with. The user is not told about it yet — the toast of the persistence
 * problems (TODO 66) will carry that message.
 *
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 * @param url The query string to read, the one of the page by default.
 * @param onProgress The reader of the progress of the load, when the editor has a cover to fill.
 *
 * @returns The built map of the level of the session.
 */
export async function loadStarterLevel(
  fetchImpl: typeof fetch = fetch,
  url: UrlAdapter | undefined = getUrlAdapter(undefined),
  onProgress?: LoadProgressHandler,
): Promise<ArxMap> {
  const source = starterLevelSource(url)

  try {
    return await loadLevel(source, fetchImpl, onProgress)
  } catch {
    return await loadLevel(createBlankLevelSource(FLAT_PRESET), fetchImpl, onProgress)
  }
}
