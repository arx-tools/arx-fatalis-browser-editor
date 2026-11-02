import JSZip from 'jszip'
import type { LevelFiles, LevelSource } from './levelSource.ts'

/**
 * The extensions of the three files a level is made of.
 *
 * @remarks
 * The zip of a level is not only the level: it carries the textures, the sounds, the scripts and the models of the
 * level too (a sample has 193 files), so the three are found by their extension and their name, not on a fixed path.
 */
const LEVEL_EXTENSIONS = ['dlf', 'fts', 'llf'] as const

/**
 * One of the three file extensions of a level.
 */
type LevelExtension = (typeof LEVEL_EXTENSIONS)[number]

/**
 * The name of the manifest the generator writes into the zip of a level.
 */
const MANIFEST_NAME = 'manifest.json'

/**
 * What the manifest of a level zip says about the level.
 *
 * @remarks
 * The old generator writes these keys; the ones the loader does not use yet (the author, the version, the generator)
 * are kept, so a later round can show them without reading the file again.
 */
export interface LevelManifest {
  /**
   * The name of the level.
   */
  readonly name?: string
  /**
   * The version of the level.
   */
  readonly version?: string
  /**
   * What the level is, in a sentence.
   */
  readonly description?: string
  /**
   * Who made the level.
   */
  readonly author?: string
  /**
   * The seed the generator made the level with.
   */
  readonly seed?: number
  /**
   * The paths the generator wrote, the level files among them.
   *
   * @remarks
   * The paths of the sample are **absolute machine paths** of the generator's output (the generator wrote the
   * installed location), so they do not match the paths inside the zip. The base names do, which is why the loader
   * matches on those.
   */
  readonly files?: readonly string[]
}

/**
 * A level read out of a zip.
 */
export interface ZipLevel {
  /**
   * What the level is called: the name of the manifest, or the name of the zip.
   */
  readonly label: string
  /**
   * The three packed files of the level.
   */
  readonly files: LevelFiles
  /**
   * The manifest of the zip, when it has one.
   */
  readonly manifest: LevelManifest | undefined
}

/**
 * Reads the name of a file of a zip path.
 *
 * @param path The path inside the zip.
 *
 * @returns The part after the last slash.
 */
function baseNameOf(path: string): string {
  return path.split('/').at(-1) ?? path
}

/**
 * Reads the name of the folder a zip path is in.
 *
 * @param path The path inside the zip.
 *
 * @returns The name of the folder that holds the file, or an empty string when it is at the root.
 */
function folderNameOf(path: string): string {
  return path.split('/').at(-2) ?? ''
}

/**
 * Tells whether a zip path has an extension, ignoring the case.
 *
 * @param path The path inside the zip.
 * @param extension The extension to look for, without the dot.
 *
 * @returns True when the path ends with the extension.
 */
function hasExtension(path: string, extension: LevelExtension): boolean {
  return path.toLowerCase().endsWith(`.${extension}`)
}

/**
 * Reads the manifest of a zip.
 *
 * @remarks
 * A manifest that is not there, or one that is not a JSON object, is **not** an error: the loader finds the three
 * files without it, and the manifest only makes the level self-describing.
 *
 * @param archive The zip to read.
 *
 * @returns The manifest, or `undefined` when the zip has none.
 */
async function readManifest(archive: JSZip): Promise<LevelManifest | undefined> {
  const entry = Object.values(archive.files).find((file) => {
    return !file.dir && baseNameOf(file.name).toLowerCase() === MANIFEST_NAME
  })

  if (entry === undefined) {
    return undefined
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(await entry.async('string'))
  } catch {
    return undefined
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return undefined
  }

  const candidate = parsed as Record<string, unknown>
  let name: string | undefined
  let version: string | undefined
  let description: string | undefined
  let author: string | undefined
  let seed: number | undefined
  let files: string[] | undefined

  if (typeof candidate.name === 'string') {
    name = candidate.name
  }

  if (typeof candidate.version === 'string') {
    version = candidate.version
  }

  if (typeof candidate.description === 'string') {
    description = candidate.description
  }

  if (typeof candidate.author === 'string') {
    author = candidate.author
  }

  if (typeof candidate.seed === 'number') {
    seed = candidate.seed
  }

  if (Array.isArray(candidate.files)) {
    files = candidate.files.filter((file): file is string => {
      return typeof file === 'string'
    })
  }

  return { name, version, description, author, seed, files }
}

/**
 * Reads the files of a zip, in a stable order.
 *
 * @param archive The zip to read.
 *
 * @returns The entries that are not folders, sorted by their path, so the same zip always gives the same level.
 */
function entriesOf(archive: JSZip): JSZip.JSZipObject[] {
  return Object.values(archive.files)
    .filter((file) => {
      return !file.dir
    })
    .toSorted((one, other) => {
      return one.name.localeCompare(other.name)
    })
}

/**
 * Reads the candidates of one of the three files of a level.
 *
 * @remarks
 * The zip of a level may hold more than one level, and the game keeps the very scene under a `levels` folder, so the
 * candidates there come first. The manifest decides between those: its `files` list is what the generator wrote down
 * as the level, so the files it names win over the ones it does not.
 *
 * @param entries The files of the zip.
 * @param extension The extension to look for.
 * @param mentioned The base names the manifest lists, in lower case.
 *
 * @returns The matching files, the best first.
 */
function candidatesOf(
  entries: readonly JSZip.JSZipObject[],
  extension: LevelExtension,
  mentioned: ReadonlySet<string>,
): JSZip.JSZipObject[] {
  const matching = entries.filter((entry) => {
    return hasExtension(entry.name, extension)
  })
  const inLevels = matching.filter((entry) => {
    return entry.name.toLowerCase().includes('/levels/')
  })
  const inManifest = matching.filter((entry) => {
    return mentioned.has(baseNameOf(entry.name).toLowerCase())
  })

  // the order of the preference is the order of the filters: a level under `levels` that the manifest names first,
  // then whatever the manifest names, then the rest under `levels`, then the plain extension match
  const named = inLevels.filter((entry) => {
    return inManifest.includes(entry)
  })

  return [...named, ...inManifest, ...inLevels, ...matching]
}

/**
 * Picks the file of a level: the one the name of the level asks for, or the best candidate.
 *
 * @param candidates The files with the extension of the one to pick, the best first.
 * @param name The name of the level (the folder of its scene), or `undefined` when there is none yet.
 *
 * @returns The file, or `undefined` when the zip has none with that extension.
 */
function pick(candidates: readonly JSZip.JSZipObject[], name: string | undefined): JSZip.JSZipObject | undefined {
  if (name === undefined) {
    return candidates[0]
  }

  const named = candidates.find((entry) => {
    return baseNameOf(entry.name).toLowerCase().startsWith(`${name.toLowerCase()}.`)
  })

  return named ?? candidates[0]
}

/**
 * Reads the three files of the level out of a zip.
 *
 * @param archive The zip to read.
 * @param manifest The manifest of the zip, when it has one.
 * @param label The name of the zip, for the error messages.
 *
 * @returns The three packed files.
 *
 * @throws When the zip has no file with one of the three extensions: the three are what a level is, and a zip
 * without one of them is not a level.
 */
async function readLevelFiles(archive: JSZip, manifest: LevelManifest | undefined, label: string): Promise<LevelFiles> {
  const entries = entriesOf(archive)
  const mentioned = new Set(
    (manifest?.files ?? []).map((path) => {
      return baseNameOf(path).toLowerCase()
    }),
  )

  const candidates = new Map<LevelExtension, JSZip.JSZipObject[]>()

  for (const extension of LEVEL_EXTENSIONS) {
    candidates.set(extension, candidatesOf(entries, extension, mentioned))
  }

  const scene = candidates.get('fts')?.[0]

  if (scene === undefined) {
    throw new Error(`The zip ${label} has no .fts file: it is not a level of Arx.`)
  }

  // the folder of the scene is the name of the level: the generator writes `levels/<level>/fast.fts` and
  // `levels/<level>/<level>.dlf`, so the name of the folder is the name of the two files beside it
  const name = folderNameOf(scene.name)
  const dlf = pick(candidates.get('dlf') ?? [], name)
  const llf = pick(candidates.get('llf') ?? [], name)

  if (dlf === undefined) {
    throw new Error(`The zip ${label} has no .dlf file: a level needs a .dlf, an .fts and an .llf.`)
  }

  if (llf === undefined) {
    throw new Error(`The zip ${label} has no .llf file: a level needs a .dlf, an .fts and an .llf.`)
  }

  const [dlfData, ftsData, llfData] = await Promise.all([
    dlf.async('arraybuffer'),
    scene.async('arraybuffer'),
    llf.async('arraybuffer'),
  ])

  return { dlf: dlfData, fts: ftsData, llf: llfData }
}

/**
 * Reads a level out of a zip.
 *
 * @remarks
 * The zip keeps the layout of the installed game (the scene under `game/graph/levels`, the description beside it) and
 * carries assets that are not a level of their own: the textures, the sounds, the scripts and the models. Only the
 * three level files are read here; the rest is left in the zip for the export of a later round.
 *
 * @param data The bytes of the zip.
 * @param label The name of the zip, which the manifest can override with the name of the level.
 *
 * @returns The three files and what the manifest said about them.
 *
 * @throws When the zip can not be read, or when it has no .dlf, .fts and .llf in it.
 */
export async function readLevelFromZip(data: ArrayBuffer, label: string): Promise<ZipLevel> {
  let archive: JSZip

  try {
    archive = await JSZip.loadAsync(data)
  } catch {
    throw new Error(`The file ${label} is not a zip.`)
  }

  const manifest = await readManifest(archive)
  const files = await readLevelFiles(archive, manifest, label)

  return { label: manifest?.name ?? label, files, manifest }
}

/**
 * The source of a level that comes from a zip the user opened.
 *
 * @remarks
 * The zip is read when the level is loaded and not when it is opened, so an unusable zip fails in the load, where the
 * error of the level store catches it.
 *
 * @param name The name of the zip, as the user sees it.
 * @param data The bytes of the zip.
 *
 * @returns The source, which needs no network.
 */
export function createZipLevelSource(name: string, data: ArrayBuffer): LevelSource {
  return {
    label: name,
    load: async (): Promise<LevelFiles> => {
      const level = await readLevelFromZip(data, name)

      return level.files
    },
  }
}
