import { GENERATOR_ASSETS } from '../../../generator/assets.ts'

/**
 * The folder the game reads the textures of a level from, in the data directory.
 *
 * @remarks
 * A level names its textures by the file name only (`[stone]_human_wall1.bmp`, `jorge-[stone].jpg`), and the game looks
 * for them under this folder of its data directory, or in the PAK it replaces: an archive of a mod writes its own
 * textures here, beside the level files, so a texture the game does not have comes with the level.
 */
export const TEXTURE_FOLDER = 'graph/obj3d/textures'

/**
 * The level the textures are read from: the containers of its FTS hold the names.
 *
 * @remarks
 * The shape is the one of `map.fts.textureContainers` (an `ArxMap` satisfies it), so a reader of the names does not need
 * the whole map, and a test stands a list of its own.
 */
export type TextureOwner = {
  readonly fts: {
    readonly textureContainers: ReadonlyArray<{ readonly filename: string }>
  }
}

/**
 * One texture of the archive: the path inside the zip and the bytes of the file.
 */
export type ExportTexture = {
  /**
   * Where the file goes in the archive, like `graph/obj3d/textures/jorge-[stone].jpg`.
   */
  readonly path: string
  /**
   * The bytes of the file.
   */
  readonly bytes: ArrayBuffer
}

/**
 * What the archive takes from the textures of the level.
 */
export type ExportTextures = {
  /**
   * The textures the archive carries.
   */
  readonly textures: readonly ExportTexture[]
  /**
   * The names the archive leaves out, because the game has them (a texture of the data directory).
   */
  readonly skipped: readonly string[]
}

/**
 * Reads the bytes of an asset of the build, by its url.
 *
 * @param url The url of the file in the build.
 *
 * @returns The bytes of the file.
 *
 * @throws When the file can not be read.
 */
async function readAssetOf(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`The texture could not be read: ${url} (${String(response.status)})`)
  }

  return await response.arrayBuffer()
}

/**
 * The names of the texture containers of a level, in the order of the FTS, each once.
 *
 * @param map The level to read.
 *
 * @returns The file names of the containers, each once.
 */
function textureNamesOf(map: TextureOwner): string[] {
  return [
    ...new Set(
      map.fts.textureContainers.map((container) => {
        return container.filename
      }),
    ),
  ]
}

/**
 * Collects the textures the archive of a level has to carry.
 *
 * @remarks
 * The archive holds the **textures the game does not have**: the ones the zip of the level carried (the pictures its
 * author added, and whose bytes the paint already read) and the **own assets of the generator** (the placeholder
 * `jorge-[stone].jpg` a level made from nothing draws with). A texture the game's data directory has is left out: the
 * game finds its own file, and copying the whole set of the game's textures into every archive would be hundreds of
 * megabytes. A name neither of the two knows is left out too, and named in {@link ExportTextures.skipped}: the paint
 * shows the placeholder for it, and the game shows its own missing texture, which is a texture the author has to give.
 *
 * The order is the order of the containers of the level, and a name is written once.
 *
 * @param map The level the archive is written from.
 * @param sources What the paint of the level found about its textures: the bytes of the pictures of the level's zip, by
 * the name the level calls them.
 * @param read Reads the bytes of an asset of the build; the tests give their own.
 *
 * @returns The textures of the archive and the names it leaves to the game.
 */
export async function exportTexturesFor(
  map: TextureOwner,
  sources: { readonly fromZip: ReadonlyMap<string, ArrayBuffer> } | undefined,
  read: (url: string) => Promise<ArrayBuffer> = readAssetOf,
): Promise<ExportTextures> {
  const names = textureNamesOf(map)
  const textures: ExportTexture[] = []
  const skipped: string[] = []
  const seen = new Set<string>()

  for (const name of names) {
    if (seen.has(name)) {
      continue
    }

    seen.add(name)

    const fromZip = sources?.fromZip.get(name)

    if (fromZip !== undefined) {
      textures.push({ path: `${TEXTURE_FOLDER}/${name}`, bytes: fromZip })

      continue
    }

    const url = GENERATOR_ASSETS[name]

    if (url !== undefined) {
      textures.push({ path: `${TEXTURE_FOLDER}/${name}`, bytes: await read(url) })

      continue
    }

    skipped.push(name)
  }

  return { textures, skipped }
}
