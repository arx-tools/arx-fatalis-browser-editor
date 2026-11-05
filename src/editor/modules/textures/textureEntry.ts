/**
 * Where a texture the editor can paint with comes from.
 *
 * @remarks
 * The two sources are the two places a face gets its texture from: the **data directory of the game**, which is the same
 * for every level, and the **level itself** — the textures a zip carries, the placeholder of the generator and the files
 * the user dropped on the texture list. The second group belongs to one level: a texture of a minigame is not a texture
 * of another level's faces.
 */
export type TextureSource = 'arx' | 'custom'

/**
 * A texture the editor can paint faces with.
 */
export interface TextureEntry {
  /**
   * Where the texture comes from.
   */
  readonly source: TextureSource
  /**
   * The name the level would call the texture, like `[stone]_human_wall1.bmp`.
   *
   * @remarks
   * It is the name a texture container of the level holds: the file name inside `graph/obj3d/textures`, usually with its
   * extension, and a file name without one for a zip whose level names its textures that way.
   */
  readonly name: string
  /**
   * The bytes of the texture, when they are at hand already (a file the user dropped on the widget).
   *
   * @remarks
   * A texture of the game, or of the zip of a level, is read when the editor needs it (a thumbnail, a paint); the one the
   * user dropped is read on the drop, because the file of the page is the only copy of it.
   */
  readonly bytes?: ArrayBuffer
}
