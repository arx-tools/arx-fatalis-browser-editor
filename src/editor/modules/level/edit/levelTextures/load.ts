import JSZip from 'jszip'
import { RepeatWrapping, SRGBColorSpace, Texture } from 'three'
import { BLANK_LEVEL_TEXTURE, GENERATOR_ASSETS } from '../../../../../generator/assets.ts'
import { decodeTextureBitmap } from '../../../textures/image.ts'

/**
 * Where the textures of a level come from, and how a file becomes a texture.
 *
 * @remarks
 * A level names the textures it draws with (`[stone]_human_wall1.bmp`), but the files themselves come from two places:
 * the **zip** of the level (the textures its author added) and the **data directory** of the game (the ones the level
 * uses from the game itself). This module is the first half of that: it finds the files in a zip, lists the images the
 * zip carries, and decodes the bytes into `three` textures. The second half — what a texture does on a face — is
 * [`paint.ts`](paint.ts), and the module that puts the two together is the facade
 * [`../levelTextures.ts`](../levelTextures.ts).
 */

/**
 * The extensions of the image files a zip may carry.
 *
 * @remarks
 * A zip of a level holds its files, its scripts and its sounds as well as its textures: the list of the textures it
 * brings is the list of its images.
 */
const IMAGE_EXTENSIONS = /\.(?:bmp|jpe?g|png|tga)$/iu

/**
 * The anisotropic filtering the textures of a level ask for.
 *
 * @remarks
 * A level is looked at along the floor and the walls, at a grazing angle where an unfiltered texture turns into a
 * shimmer of noise (a wall of bricks reads as a mess). The hardware filters along the direction of the view up to a
 * limit of its own, and three clamps the value to that limit, so a number that is high enough for every card asks for
 * the best a machine has.
 */
const ANISOTROPY = 16

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
 * Reads the names the manifest of a zip lists, in lower case.
 *
 * @param archive The zip to read.
 *
 * @returns The base names of the files the manifest wrote down, or `undefined` when the zip has no usable manifest.
 */
async function listedNamesOf(archive: JSZip): Promise<Set<string> | undefined> {
  const entry = Object.values(archive.files).find((file) => {
    return !file.dir && baseNameOf(file.name).toLowerCase() === 'manifest.json'
  })

  if (entry === undefined) {
    return undefined
  }

  try {
    const manifest: unknown = JSON.parse(await entry.async('string'))

    if (typeof manifest !== 'object' || manifest === null) {
      return undefined
    }

    const { files } = manifest as { files?: unknown }

    if (!Array.isArray(files)) {
      return undefined
    }

    return new Set(
      files
        .filter((file): file is string => {
          return typeof file === 'string'
        })
        .map((path) => {
          return baseNameOf(path).toLowerCase()
        }),
    )
  } catch {
    // a manifest that is not JSON does not stop the textures: the names of the containers find them anyway
    return undefined
  }
}

/**
 * The extensions a texture may have.
 *
 * @remarks
 * The game's textures are BMP, JPG and PNG files, and a level may name one without its extension (`[glass]_windows2`),
 * so the name alone is tried first and the extensions after it.
 */
const TEXTURE_EXTENSIONS = ['', '.jpg', '.bmp', '.png', '.jpeg'] as const

/**
 * Finds the file of a texture, by the name the level calls it.
 *
 * @param byName The files of the zip, by their base name in lower case.
 * @param name The name the level calls the texture.
 *
 * @returns The file, or `undefined` when the zip has none of the names tried.
 */
function entryOf(byName: ReadonlyMap<string, JSZip.JSZipObject>, name: string): JSZip.JSZipObject | undefined {
  const lower = name.toLowerCase()

  for (const extension of TEXTURE_EXTENSIONS) {
    const entry = byName.get(`${lower}${extension}`)

    if (entry !== undefined) {
      return entry
    }
  }

  return undefined
}

/**
 * Finds the files of the textures of a level in the zip of the level.
 *
 * @remarks
 * The level names its textures the way the game reads them (`[stone]_human_wall1.bmp`), and the zip keeps them under
 * the folders of the installed game, so the **base name** is what matches. The manifest of the zip lists the files it
 * wrote with absolute machine paths, so it can not be matched against the paths inside the zip either; the names it
 * lists are what a texture is checked against when there is a manifest — a zip may carry a texture the level no longer
 * uses, and the manifest is what says which files belong to it.
 *
 * @param data The bytes of the zip.
 * @param names The names of the texture containers of the level.
 *
 * @returns The bytes of every texture the zip holds, by the name of the container.
 */
export async function findTextureFiles(data: ArrayBuffer, names: readonly string[]): Promise<Map<string, ArrayBuffer>> {
  const archive = await JSZip.loadAsync(data)
  const entries = Object.values(archive.files).filter((entry) => {
    return !entry.dir
  })
  const byName = new Map<string, JSZip.JSZipObject>()

  for (const entry of entries) {
    byName.set(baseNameOf(entry.name).toLowerCase(), entry)
  }

  const listed = await listedNamesOf(archive)
  const files = new Map<string, ArrayBuffer>()

  for (const name of names) {
    const entry = entryOf(byName, name)

    if (entry === undefined) {
      continue
    }

    // the manifest lists the file with its extension, and a container may name it without one
    if (listed !== undefined && !listed.has(baseNameOf(entry.name).toLowerCase())) {
      continue
    }

    files.set(name, await entry.async('arraybuffer'))
  }

  return files
}

/**
 * Reads the file names of the images a zip carries.
 *
 * @remarks
 * A level names the textures it uses, and the zip of the level may carry more images than that (a texture the author
 * kept, an unused wall): the editor lists them as the textures of the level too, so a face can be painted with them. Only
 * the images are listed — the zip of a level has its files, its scripts and its sounds as well.
 *
 * @param data The bytes of the zip.
 *
 * @returns The base names of the images, without a repeat, in the order of the zip.
 */
export async function zipImageNames(data: ArrayBuffer): Promise<string[]> {
  const archive = await JSZip.loadAsync(data)
  const names = new Set<string>()

  for (const file of Object.values(archive.files)) {
    if (file.dir) {
      continue
    }

    const name = baseNameOf(file.name)

    if (IMAGE_EXTENSIONS.test(name)) {
      names.add(name)
    }
  }

  return [...names]
}

/**
 * Makes the texture of a decoded image.
 *
 * @remarks
 * The image becomes a texture the way the game reads it: the colours are sRGB (`SRGBColorSpace`), and the texture
 * repeats (`RepeatWrapping`), because the coordinates of an Arx polygon run past one on a wall. Every texture of the
 * editor comes through here — the ones of a zip, the ones of the data directory and the ones the user drops — so the
 * filtering is the same wherever the file came from.
 *
 * @param image The decoded image.
 *
 * @returns The texture, ready to be drawn.
 */
export function createLevelTexture(image: TexImageSource): Texture {
  const texture = new Texture(image)

  texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = ANISOTROPY
  texture.needsUpdate = true

  return texture
}

/**
 * Decodes the textures of a level.
 *
 * @param files The bytes of the textures, by the name the level calls them.
 *
 * @returns The textures, by the same names. A file the browser can not decode is left out.
 */
export async function decodeTextures(files: ReadonlyMap<string, ArrayBuffer>): Promise<Map<string, Texture>> {
  const textures = new Map<string, Texture>()

  for (const [name, bytes] of files) {
    try {
      const texture = createLevelTexture(await decodeTextureBitmap(name, bytes))

      textures.set(name, texture)
    } catch {
      // a texture the browser can not read stays flat: the level is still complete
    }
  }

  return textures
}

/**
 * The placeholder the faces without a texture draw with, kept between the paints of a level.
 *
 * @remarks
 * It is loaded once and kept: a level is painted many times (every edit re-groups the faces) but the placeholder is
 * always the same file.
 */
let missingTexture: Texture | undefined

/**
 * Loads the placeholder the faces without a texture draw with.
 *
 * @remarks
 * The textures of the game itself are not in a zip of the generator, so a level opened from a zip would show a flat
 * grey where they belong. The placeholder of the generator (`jorge-[stone].jpg`, the texture `Texture.missingTexture`
 * of the Arx Level Generator puts under a new map) says "a texture belongs here" and tiles over the surface, so the
 * level reads as a level and not as a patchwork of grey.
 *
 * @returns The texture of {@link BLANK_LEVEL_TEXTURE}.
 *
 * @throws When the file of the generator can not be loaded.
 */
export async function loadMissingTexture(): Promise<Texture> {
  if (missingTexture !== undefined) {
    return missingTexture
  }

  const url = GENERATOR_ASSETS[BLANK_LEVEL_TEXTURE]

  if (url === undefined) {
    throw new Error(`The generator has no file for ${BLANK_LEVEL_TEXTURE}.`)
  }

  const image = new Image()

  image.src = url
  await image.decode()

  missingTexture = createLevelTexture(image)

  return missingTexture
}
