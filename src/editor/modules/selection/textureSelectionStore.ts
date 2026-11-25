import { shallowRef, type ShallowRef } from 'vue'
import { stemOf } from '../textures/textureCatalog.ts'
import type { TextureEntry } from '../textures/textureEntry.ts'

/**
 * The key a texture is picked by: its source and the stem of its name.
 *
 * @remarks
 * A texture has no identifier of its own: the list knows it by the name the level calls it, and the same name can come
 * from the data directory of the game and from the level itself. The catalog keeps one of them (the first it found), and
 * a texture of the level shadowed by one of the game is the same texture on the screen, so the key drops the extension
 * the way the catalog does.
 *
 * @param texture The entry of the catalog to read.
 *
 * @returns The source and the stem, joined by a colon.
 */
export function textureKeyOf(texture: TextureEntry): string {
  return `${texture.source}:${stemOf(texture.name)}`
}

/**
 * The texture the editor has picked.
 *
 * @remarks
 * The pick is the tile of the Texture Mapper, and the rows of the Selection Inspector write it too: a texture of the
 * selected faces is a click away from its place in the list (2026-11-25, the owner). The store keeps the entry, so the
 * list knows which tile to highlight, and the widget that shows the list can scroll to it.
 */
export type TextureSelectionStore = {
  /**
   * The picked texture, or `undefined` when nothing is picked.
   */
  readonly texture: ShallowRef<TextureEntry | undefined>
  /**
   * Takes the pick to a texture, or drops it.
   *
   * @param texture The texture to pick, or `undefined` to drop the pick.
   */
  readonly select: (texture: TextureEntry | undefined) => void
  /**
   * Drops the pick.
   */
  readonly clear: () => void
}

/**
 * The single store of the texture pick: the Texture Mapper and the Selection Inspector read this one.
 */
export const textureSelectionStore: TextureSelectionStore = {
  texture: shallowRef(undefined),
  select: (texture: TextureEntry | undefined): void => {
    textureSelectionStore.texture.value = texture
  },
  clear: (): void => {
    textureSelectionStore.texture.value = undefined
  },
}
