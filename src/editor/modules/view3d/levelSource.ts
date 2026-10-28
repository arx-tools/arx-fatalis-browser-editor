import { ArxMap } from '../../../generator/ArxMap.ts'

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
 * The level the first 3D round shows.
 *
 * @remarks
 * Hardcoded on purpose: the level picker is a later round, and one fixed level is enough to see whether
 * the pipeline works.
 */
export const STARTER_LEVEL = 11

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
 * Downloads, unpacks and builds a level.
 *
 * @param level The number of the level.
 * @param fetchImpl The fetch to use; the tests pass a fake one.
 *
 * @returns The built map of that level.
 */
export async function loadLevelMap(level: number = STARTER_LEVEL, fetchImpl: typeof fetch = fetch): Promise<ArxMap> {
  const files = await fetchLevelFiles(level, fetchImpl)

  return new ArxMap(files.dlf, files.fts, files.llf)
}
