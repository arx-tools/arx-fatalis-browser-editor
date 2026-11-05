import { computed, shallowRef, watch, type ComputedRef, type ShallowRef } from 'vue'
import { BLANK_LEVEL_TEXTURE, GENERATOR_ASSETS } from '../../../generator/assets.ts'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { dataDirState, listDataDirTextures, readDataFile, TEXTURE_FOLDER } from '../level/source/dataDir.ts'
import { decodeTextureBitmap, thumbnailUrlOf } from './image.ts'
import { groupOf, type TextureGroup } from './search.ts'
import type { TextureEntry, TextureSource } from './textureEntry.ts'

/**
 * The textures the editor can paint a face with.
 *
 * @remarks
 * The list of textures is made of two groups. The **game's** textures are the files of `graph/obj3d/textures` of the
 * data directory, and every level draws with them — the data directory is named once, and the list is the same until it
 * changes. The **custom** ones come with the level: the textures its zip carries, the placeholder of the generator and
 * the files the user drops on the texture list. They belong to **one level**: a texture of a minigame is not a texture
 * of another level's faces, so opening another map starts the custom group again.
 *
 * The widget shows the entries of {@link textureCatalog.entries}, and the thumbnails are read on demand
 * ({@link loadThumbnail}): a data directory has a few thousand textures, and a page of the list is a hundred of them.
 */

/**
 * The extensions a texture may have.
 *
 * @remarks
 * A level may name a texture without its extension (`[glass]_windows2`), so a name is compared by its **stem**: the same
 * texture named by the level and by the file of the data directory is one entry, not two.
 */
const EXTENSION_END = /\.(?:jpe?g|bmp|png|tga)$/iu

/**
 * The name of a texture without its extension, in lower case.
 *
 * @param name The name of the texture.
 *
 * @returns The stem, which is what two names of one texture share.
 */
export function stemOf(name: string): string {
  return name.replace(EXTENSION_END, '').toLowerCase()
}

/**
 * What the paint of a level found, so the list knows where every texture came from.
 */
export interface LevelTextureSources {
  /**
   * The level these textures belong to: another map means the custom group starts again.
   */
  readonly map: ArxMap
  /**
   * The textures the zip of the level carried, by the name the level calls them.
   */
  readonly fromZip: ReadonlyMap<string, ArrayBuffer>
  /**
   * The textures the data directory of the game had, by the name the level calls them.
   */
  readonly fromDataDir: readonly string[]
  /**
   * Every image the zip of the level carries, by the name of the file.
   *
   * @remarks
   * A zip may carry a texture the level does not use (yet): it is a texture of **that level**, so the editor offers it
   * for painting, the same way the ones the level uses.
   */
  readonly zipImages: readonly string[]
}

/**
 * The textures of the data directory of the game.
 */
const gameTextures = shallowRef<readonly string[]>([])

/**
 * What the paint of the level found.
 */
const levelSources = shallowRef<LevelTextureSources | undefined>(undefined)

/**
 * The files the user dropped on the texture list, in the order they were dropped.
 */
const dropped = shallowRef<readonly TextureEntry[]>([])

/**
 * The entries of the list, by their key (the source and the name).
 */
const thumbnails = new Map<string, ShallowRef<string | undefined>>()

/**
 * The thumbnails that are being read, so the same image is not decoded twice.
 */
const loading = new Map<string, Promise<void>>()

/**
 * The key of a texture in the caches of the module.
 *
 * @param entry The texture.
 *
 * @returns The source and the name, like `arx:[stone]_wall1.bmp`.
 */
function keyOf(entry: TextureEntry): string {
  return `${entry.source}:${entry.name}`
}

/**
 * The textures a face can be painted with, in the order the list shows them without a search.
 *
 * @remarks
 * The order is the one the user reads a level with: the textures the level **has** first (the ones of its zip, the
 * placeholder of the generator, the files dropped on the list, and the rest of the zip), then the textures of the game.
 * A name is in the list once: the stem decides, and the first group that has it wins — which is the group the paint
 * reads first (the zip of the level before the data directory), so the tile of a name shows the texture a face of the
 * level would draw with.
 */
export const textureCatalog: { readonly entries: ComputedRef<readonly TextureEntry[]> } = {
  entries: computed(() => {
    const sources = levelSources.value
    const entries: TextureEntry[] = []
    const seen = new Set<string>()

    function add(entry: TextureEntry): void {
      const stem = stemOf(entry.name)

      if (seen.has(stem)) {
        return
      }

      seen.add(stem)
      entries.push(entry)
    }

    if (sources !== undefined) {
      for (const name of sources.fromZip.keys()) {
        add({ source: 'custom', name })
      }
    }

    add({ source: 'custom', name: BLANK_LEVEL_TEXTURE })

    for (const entry of dropped.value) {
      add(entry)
    }

    if (sources !== undefined) {
      for (const name of sources.zipImages) {
        add({ source: 'custom', name })
      }
    }

    for (const name of gameTextures.value) {
      add({ source: 'arx', name })
    }

    return entries
  }),
}

/**
 * Finds the entry of a texture name.
 *
 * @param name The name a face of the level calls the texture.
 *
 * @returns The entry of the list, or `undefined` when no source of the editor has a file for it.
 */
export function entryOfName(name: string): TextureEntry | undefined {
  const stem = stemOf(name)

  return textureCatalog.entries.value.find((entry) => {
    return stemOf(entry.name) === stem
  })
}

/**
 * The source a texture name belongs to.
 *
 * @param name The name a face of the level calls the texture.
 *
 * @returns The source of its entry, or `undefined` when the editor has no file for it.
 */
export function sourceOfName(name: string): TextureSource | undefined {
  return entryOfName(name)?.source
}

/**
 * The group of the list a texture name belongs to.
 *
 * @param name The name a face of the level calls the texture.
 *
 * @returns The surface, the item or the custom group of its entry, or `undefined` when the editor has no file for it.
 */
export function textureGroupOfName(name: string): TextureGroup | undefined {
  const entry = entryOfName(name)

  if (entry === undefined) {
    return undefined
  }

  return groupOf(entry)
}

/**
 * The bytes of a texture.
 *
 * @remarks
 * A dropped file is on the page already; a texture of the level is in the bytes of the zip of the paint; a texture of the
 * game is read from the data directory, and the placeholder of the generator is the asset of the build.
 *
 * @param entry The texture to read.
 *
 * @returns The bytes, or `undefined` when no source has the file.
 */
export async function bytesOf(entry: TextureEntry): Promise<ArrayBuffer | undefined> {
  if (entry.bytes !== undefined) {
    return entry.bytes
  }

  if (entry.source === 'custom') {
    const inZip = levelSources.value?.fromZip.get(entry.name)

    if (inZip !== undefined) {
      return inZip
    }

    const url = GENERATOR_ASSETS[entry.name]

    if (url === undefined) {
      return undefined
    }

    const response = await fetch(url)

    if (!response.ok) {
      return undefined
    }

    return await response.arrayBuffer()
  }

  return await readDataFile(`${TEXTURE_FOLDER}/${entry.name}`)
}

/**
 * The decoded images of the textures, by their key.
 *
 * @remarks
 * The uv mapper draws the texture of a face at the size of its square, and the tile of the list needs the same image
 * small: the bitmap is decoded **once** per texture and both read it (the thumbnail is a canvas of the bitmap).
 */
const bitmaps = new Map<string, ShallowRef<ImageBitmap | undefined>>()

/**
 * The images that are being decoded, so the same file is not decoded twice.
 */
const decoding = new Map<string, Promise<void>>()

/**
 * The image of a texture, as a reactive value.
 *
 * @param entry The texture.
 *
 * @returns The bitmap, or `undefined` until it is decoded ({@link loadBitmap}).
 */
export function bitmapOf(entry: TextureEntry): ShallowRef<ImageBitmap | undefined> {
  const key = keyOf(entry)
  let bitmap = bitmaps.get(key)

  if (bitmap === undefined) {
    bitmap = shallowRef<ImageBitmap | undefined>(undefined)
    bitmaps.set(key, bitmap)
  }

  return bitmap
}

/**
 * Decodes the image of a texture, when it is not decoded yet.
 *
 * @param entry The texture.
 */
export async function loadBitmap(entry: TextureEntry): Promise<void> {
  const key = keyOf(entry)
  const bitmap = bitmapOf(entry)

  if (bitmap.value !== undefined) {
    return
  }

  const pending = decoding.get(key)

  if (pending !== undefined) {
    await pending

    return
  }

  const task = (async (): Promise<void> => {
    try {
      const bytes = await bytesOf(entry)

      if (bytes === undefined) {
        return
      }

      bitmap.value = await decodeTextureBitmap(entry.name, bytes)
    } catch {
      // a file the browser can not decode has no picture: the tile stays a placeholder
    } finally {
      decoding.delete(key)
    }
  })()

  decoding.set(key, task)
  await task
}

/**
 * The thumbnail of a texture, as a reactive value.
 *
 * @remarks
 * A tile of the list reads this: the value is `undefined` until the image is decoded ({@link loadThumbnail}), and the
 * tile shows a placeholder in the meantime. The same entry gives the same value across the widgets (the selection
 * inspector shows the thumbnails of the texture list), because the cache is the module's.
 *
 * @param entry The texture.
 *
 * @returns The data url of the thumbnail, or `undefined` while it is not read.
 */
export function thumbnailOf(entry: TextureEntry): ShallowRef<string | undefined> {
  const key = keyOf(entry)
  let thumbnail = thumbnails.get(key)

  if (thumbnail === undefined) {
    thumbnail = shallowRef<string | undefined>(undefined)
    thumbnails.set(key, thumbnail)
  }

  return thumbnail
}

/**
 * Reads the thumbnail of a texture, when it is not read yet.
 *
 * @param entry The texture.
 */
export async function loadThumbnail(entry: TextureEntry): Promise<void> {
  const key = keyOf(entry)
  const thumbnail = thumbnailOf(entry)

  if (thumbnail.value !== undefined) {
    return
  }

  const pending = loading.get(key)

  if (pending !== undefined) {
    await pending

    return
  }

  const task = (async (): Promise<void> => {
    try {
      await loadBitmap(entry)

      const bitmap = bitmapOf(entry).value

      if (bitmap !== undefined) {
        thumbnail.value = thumbnailUrlOf(bitmap)
      }
    } finally {
      loading.delete(key)
    }
  })()

  loading.set(key, task)
  await task
}

/**
 * The thumbnails of a page of the list, a few at a time.
 *
 * @remarks
 * A page is a hundred textures: asking for all of them at once is a hundred decodes and a hundred files from the data
 * directory in one burst. The walk keeps {@link THUMBNAIL_PARALLEL} of them in flight, and a texture that is read already
 * costs nothing.
 */
const THUMBNAIL_PARALLEL = 6

/**
 * Reads the thumbnails of the entries that have none yet.
 *
 * @param entries The textures of the page.
 */
export async function loadThumbnails(entries: readonly TextureEntry[]): Promise<void> {
  const waiting = entries.filter((entry) => {
    return thumbnailOf(entry).value === undefined
  })
  let next = 0

  async function worker(): Promise<void> {
    while (next < waiting.length) {
      const entry = waiting[next]

      next = next + 1

      if (entry !== undefined) {
        await loadThumbnail(entry)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(THUMBNAIL_PARALLEL, waiting.length) }, async () => {
      await worker()
    }),
  )
}

/**
 * Says what the paint of a level found.
 *
 * @remarks
 * The paint of the level runs when the level is loaded (and again when the data directory arrives), and it knows where
 * every texture it read came from: the zip of the level or the data directory of the game. The list of textures is built
 * from that. A **new** level starts the custom group again (its zip, its dropped files, its thumbnails), the game's
 * group is the same for every level.
 *
 * @param sources What the paint found, with the level it painted.
 */
export function publishLevelTextures(sources: LevelTextureSources): void {
  const previous = levelSources.value

  levelSources.value = sources

  if (previous?.map === sources.map) {
    return
  }

  dropped.value = []
  thumbnails.clear()
  loading.clear()
  bitmaps.clear()
  decoding.clear()
}

/**
 * Reads the list of the tables the game's textures are in, again.
 *
 * @remarks
 * It runs at the start and whenever the data directory changes (a folder picked, another url): the list is a walk of a
 * few thousand files, so it is read once and kept, and a new folder is a new list.
 */
export async function refreshGameTextures(): Promise<void> {
  gameTextures.value = await listDataDirTextures()
}

/**
 * Adds the files the user dropped on the texture list to the textures of the level.
 *
 * @remarks
 * The drop is the way to paint with a texture that is neither in the zip of the level nor in the game's data directory:
 * the file of the user is read into the page (a few dozen kilobytes), and it is a **custom** texture of the level, so the
 * next level starts without it. The file's name is the name the level calls it, so a level of the game can draw with it
 * (and the export names it in a texture container).
 *
 * A file that is not an image is skipped.
 *
 * @param files The files of the drop.
 *
 * @returns How many textures the drop added.
 */
export async function addDroppedTextures(files: readonly File[]): Promise<number> {
  const added: TextureEntry[] = []

  for (const file of files) {
    const isImage = file.type.startsWith('image/') || EXTENSION_END.test(file.name)

    if (!isImage) {
      continue
    }

    added.push({ source: 'custom', name: file.name, bytes: await file.arrayBuffer() })
  }

  if (added.length > 0) {
    const stems = new Set(
      added.map((entry) => {
        return stemOf(entry.name)
      }),
    )

    // a file dropped again replaces the one before it: the bytes of the page are the newest of the two
    dropped.value = [
      ...dropped.value.filter((entry) => {
        return !stems.has(stemOf(entry.name))
      }),
      ...added,
    ]
  }

  return added.length
}

/**
 * Starts the list of the game's textures.
 *
 * @remarks
 * The data directory of the session is read at the start (the header and the url may name one), and a change of it — a
 * folder picked, a forgotten folder — reads the list again.
 */
export function startTextureCatalog(): void {
  watch(dataDirState, () => {
    void refreshGameTextures()
  })

  void refreshGameTextures()
}
