import type { TripleOf } from 'arx-convert/utils'

/**
 * The name of the file the zip of a level carries its own state in.
 *
 * @remarks
 * The archive is not only the three files of the level: it says what the level is (a name, a version, who made it), what
 * the archive holds (the paths of its files), and what the editor that wrote it knows of the view (the camera pose). A
 * reader that finds the file reads the level by it; a reader that does not still finds the level files by their name.
 */
export const MANIFEST_NAME = 'manifest.json'

/**
 * The camera pose the manifest carries: where the camera stands and looks on the level.
 *
 * @remarks
 * It is the pose of the editor's camera when the level was written, and it is **not** the spawn of the player: the spawn
 * is the level's own (`player.position` in the DLF), and it is a separate idea.
 */
export interface ManifestCamera {
  /**
   * The eye of the camera, in the game's coordinates.
   */
  readonly position: TripleOf<number>
  /**
   * The facing of the camera: pitch and yaw in the game's degrees, and a roll that is always `0`.
   */
  readonly rotation: TripleOf<number>
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
 * The keys are the ones the level generator writes, in its order: the seed it made the level with, the program that made
 * it, the level itself, and the paths of the files. The editor adds {@link ManifestEditor} and {@link ManifestCamera}
 * to that base, so a manifest says both where the level came from and which build wrote the archive.
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
   * The name of the program that made the level.
   */
  readonly generator?: string
  /**
   * The version of that program.
   */
  readonly generatorVersion?: string
  /**
   * Where the code of that program lives.
   */
  readonly generatorUrl?: string
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
   * Where the level lives (its repository, its page).
   */
  readonly url?: string
  /**
   * The build of the editor that wrote the archive, when it was written by one.
   */
  readonly editor?: ManifestEditor
  /**
   * The pose of the editor's camera when the archive was written.
   */
  readonly camera?: ManifestCamera
  /**
   * The paths of the files of the archive.
   *
   * @remarks
   * The paths are the ones inside the zip, with a leading slash (`/game/graph/levels/level8/fast.fts`). An older
   * generator wrote absolute machine paths of its output folder, so a reader matches on the base names instead.
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
 * Reads a triplet of finite numbers, the shape the camera pose is written in.
 *
 * @param value The value to read.
 *
 * @returns The triplet, or `undefined` when the value is not three finite numbers.
 */
function tripletOf(value: unknown): TripleOf<number> | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    return undefined
  }

  const parts = value as unknown[]

  if (
    parts.some((part) => {
      return typeof part !== 'number' || !Number.isFinite(part)
    })
  ) {
    return undefined
  }

  return parts as TripleOf<number>
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
 * Reads the camera pose of a parsed manifest.
 *
 * @remarks
 * The numbers of the pose are checked here, but whether the camera **can** take the angle is the camera's business: the
 * reader that moves a camera drops a pose it can not apply.
 *
 * @param value The value of the `camera` key.
 *
 * @returns The pose, or `undefined` when the value is not a pose.
 */
function cameraOf(value: unknown): ManifestCamera | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const block = value as Record<string, unknown>
  const position = tripletOf(block.position)
  const rotation = tripletOf(block.rotation)

  if (position === undefined || rotation === undefined) {
    return undefined
  }

  return { position, rotation }
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
    generator: stringOf(parsed, 'generator'),
    generatorVersion: stringOf(parsed, 'generatorVersion'),
    generatorUrl: stringOf(parsed, 'generatorUrl'),
    name: stringOf(parsed, 'name'),
    version: stringOf(parsed, 'version'),
    description: stringOf(parsed, 'description'),
    author: stringOf(parsed, 'author'),
    url: stringOf(parsed, 'url'),
    editor: editorOf(parsed.editor),
    camera: cameraOf(parsed.camera),
    files: readFiles,
  }

  return manifest
}

/**
 * What the level generator says about itself in a manifest.
 */
export interface GeneratorInfo {
  /**
   * The name of the program that made the files of the level.
   */
  readonly generator: string
  /**
   * The version of that program.
   */
  readonly generatorVersion: string
  /**
   * Where the code of that program lives.
   */
  readonly generatorUrl: string
}

/**
 * The name the generator writes into a manifest.
 *
 * @remarks
 * The generator of the editor is the one that will be a library of its own, and its version is not one of its own yet:
 * it is built with the editor and takes the version of that build. The name says which generator it is, not which
 * version of a numbered program, which is why it carries the `2` of the next one.
 */
export const GENERATOR_NAME = 'arx-level-generator2'

/**
 * Where the code of the generator lives.
 *
 * @remarks
 * The generator is a part of the editor today, so the address is the one of the editor. It moves to its own repository
 * when the generator is a library, and this value moves with it.
 */
export const GENERATOR_URL = 'https://github.com/arx-tools/arx-fatalis-browser-editor'

/**
 * The generator's part of a manifest.
 *
 * @param version The version of the build the generator is a part of.
 *
 * @returns The three keys the generator signs a manifest with.
 */
export function generatorInfoOf(version: string): GeneratorInfo {
  return { generator: GENERATOR_NAME, generatorVersion: version, generatorUrl: GENERATOR_URL }
}
