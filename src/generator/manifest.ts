/**
 * The name of the file the zip of a level says what it is in.
 *
 * @remarks
 * The archive is not only the three files of the level: this says what the level is (a name, a version, who made it),
 * which build of the editor wrote it, and which files the archive holds. The state of the **editor** (the pose of the
 * camera, the steps of the history) is not here: it lives in `editor/settings.json`, under the folder of the editor, so
 * the manifest stays the description of the level and a reader of it does not walk the state of a program.
 */
export const MANIFEST_NAME = 'manifest.json'

/**
 * Who made the level.
 *
 * @remarks
 * A manifest of another build may name the author in one string, and that one is read as a name (see
 * {@link manifestOf}).
 */
export interface ManifestAuthor {
  /**
   * The name of the author, as they write it.
   */
  readonly name?: string
}

/**
 * The level as a project: the page it is published on.
 *
 * @remarks
 * It is where the level lives, not who made it: a page of a mod site, or a website the author keeps for it. The older
 * manifests put the same address in a `url` key, and that one is read as the homepage of the project (see
 * {@link manifestOf}).
 */
export interface ManifestProject {
  /**
   * The address of the page the level is published on.
   */
  readonly homepage?: string
}

/**
 * The build of the tool that wrote the archive, with the moment it was written.
 *
 * @remarks
 * The block is the one the editor adds to the manifest the generator issues: the generator says what the level is, and
 * this says which build of which program wrote the files. The version, the commit and the build date are of the build,
 * so a file whose numbers look wrong can be traced back to the program that made it.
 */
export interface ManifestEditor {
  /**
   * The name of the program, from its `package.json`.
   */
  readonly name: string
  /**
   * The version of the build, from its `package.json`.
   */
  readonly version: string
  /**
   * The commit of the build, or `local` for a build that was not made by the release workflow.
   */
  readonly commit: string
  /**
   * The day the build was made, as an ISO date.
   */
  readonly builtAt: string
  /**
   * Where the code of the program lives.
   */
  readonly url: string
  /**
   * The moment the archive was written, as an ISO timestamp.
   */
  readonly exportedAt: string
}

/**
 * What the `manifest.json` of a level zip says.
 *
 * @remarks
 * The keys are the ones the level generator writes for a level (its seed, its name and version, who made it, where it
 * lives), the block of the build of the editor that wrote the archive, and the files the archive holds. There is one
 * signing key, the editor's: two of them side by side would say the same thing twice, and the files of the archive are
 * written by the editor.
 *
 * Every key is optional: a manifest of another build may hold some of them, and the loader reads the level without it.
 */
export interface LevelManifest {
  /**
   * The seed the level was made with.
   *
   * @remarks
   * The generator writes a number, and the editor writes the text the user typed into the export dialog: the seed of a
   * level is whatever text starts its random numbers, not only a number.
   */
  readonly seed?: number | string
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
  readonly author?: ManifestAuthor
  /**
   * Where the level lives (its page, its repository).
   */
  readonly project?: ManifestProject
  /**
   * The build of the editor that wrote the archive, when it was written by one.
   */
  readonly editor?: ManifestEditor
  /**
   * The paths of every file the archive holds, the manifest itself excepted.
   *
   * @remarks
   * The list is the content of the archive, not only the files the game reads: the level, the source the editor kept,
   * and the settings of the editor among them. An older generator wrote absolute machine paths of its own folder, so a
   * reader matches the files of a level on their base names.
   */
  readonly files?: readonly string[]
}

/**
 * Reads a string key of a parsed manifest.
 *
 * @param value The parsed manifest.
 * @param key The key to read.
 *
 * @returns The value, or `undefined` when the key is missing or not a string.
 */
function stringOf(value: Record<string, unknown>, key: string): string | undefined {
  const found = value[key]

  if (typeof found !== 'string') {
    return undefined
  }

  return found
}

/**
 * Reads the author block of a parsed manifest.
 *
 * @remarks
 * A manifest of an older build names the author in **one string**, and that is read as the name of the author: the
 * archive keeps it through an export instead of losing it, and the writer of this build writes the block.
 *
 * @param value The value of the `author` key.
 *
 * @returns The block, or `undefined` when the value names no author.
 */
function authorOf(value: unknown): ManifestAuthor | undefined {
  if (typeof value === 'string') {
    const name = value.trim()

    if (name === '') {
      return undefined
    }

    return { name }
  }

  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const block = value as Record<string, unknown>
  const name = stringOf(block, 'name')

  if (name === undefined) {
    return undefined
  }

  return { name }
}

/**
 * Reads the project block of a parsed manifest.
 *
 * @remarks
 * The homepage of the project is the `url` of the older manifests: a zip of another build keeps its address through an
 * export, in the place this build writes it.
 *
 * @param value The value of the `project` key.
 * @param url The value of the `url` key of an older manifest.
 *
 * @returns The block, or `undefined` when the manifest names no page.
 */
function projectOf(value: unknown, url: unknown): ManifestProject | undefined {
  let block: Record<string, unknown> = {}

  if (value !== null && typeof value === 'object') {
    block = value as Record<string, unknown>
  }

  let homepage = stringOf(block, 'homepage')

  if (homepage === undefined && typeof url === 'string' && url.trim() !== '') {
    homepage = url.trim()
  }

  if (homepage === undefined) {
    return undefined
  }

  return { homepage }
}

/**
 * Reads the editor block of a parsed manifest.
 *
 * @param value The value of the `editor` key.
 *
 * @returns The block, or `undefined` when a field of it is missing.
 */
function editorOf(value: unknown): ManifestEditor | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const block = value as Record<string, unknown>
  const name = stringOf(block, 'name')
  const version = stringOf(block, 'version')
  const commit = stringOf(block, 'commit')
  const builtAt = stringOf(block, 'builtAt')
  const url = stringOf(block, 'url')
  const exportedAt = stringOf(block, 'exportedAt')

  if (
    name === undefined ||
    version === undefined ||
    commit === undefined ||
    builtAt === undefined ||
    url === undefined ||
    exportedAt === undefined
  ) {
    return undefined
  }

  return { name, version, commit, builtAt, url, exportedAt }
}

/**
 * Reads a parsed `manifest.json`.
 *
 * @remarks
 * A value of another build is not guessed at: a key that is not the kind this build reads is dropped, and the level is
 * still loaded (the manifest only makes it self-describing). A file that is not a JSON object, or not JSON at all, says
 * nothing about the level, which is what `undefined` means.
 *
 * @param value The value the file held, parsed as JSON.
 *
 * @returns The manifest, or `undefined` when the value is not one.
 */
export function manifestOf(value: unknown): LevelManifest | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const parsed = value as Record<string, unknown>
  const { seed, files } = parsed
  let readSeed: number | string | undefined

  if (typeof seed === 'number' || typeof seed === 'string') {
    readSeed = seed
  }

  let readFiles: string[] | undefined

  if (Array.isArray(files)) {
    readFiles = files.filter((file): file is string => {
      return typeof file === 'string'
    })
  }

  const manifest: LevelManifest = {
    seed: readSeed,
    name: stringOf(parsed, 'name'),
    version: stringOf(parsed, 'version'),
    description: stringOf(parsed, 'description'),
    author: authorOf(parsed.author),
    project: projectOf(parsed.project, parsed.url),
    editor: editorOf(parsed.editor),
    files: readFiles,
  }

  return manifest
}
