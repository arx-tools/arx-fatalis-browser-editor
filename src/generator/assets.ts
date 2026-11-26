/**
 * The files the generator brings with it.
 *
 * @remarks
 * A level needs at least one texture, and a level made from nothing has no file of the game to point at: the
 * generator carries its own. The key of the map is the file name the level stores in its texture containers, and the
 * value is the url of the file in the build (a `Vite` import, so the asset is part of the output).
 *
 * The first one is the one the Arx Level Generator gives a new map's floor (`Texture.missingTexture` there): the
 * placeholder that says "a texture belongs here".
 */
/**
 * The own assets of the generator, by the name a level stores.
 *
 * @remarks
 * The url of a file is read with `new URL(..., import.meta.url)`, which `Vite` knows how to follow: the file is part
 * of the build under a hashed name, and the level stores the plain name (`jorge-[stone].jpg`) instead.
 */
export const GENERATOR_ASSETS: Readonly<Record<string, string>> = {
  'jorge-[stone].jpg': new URL('assets/jorge-[stone].jpg', import.meta.url).href,
}

/**
 * The models the generator brings with it, by the path the data directory keeps them at.
 *
 * @remarks
 * The walkable view draws the player of the level from the game's own model, and a level made from nothing has no data
 * directory to read it from: the generator carries the file, so the spawn of a blank level shows the body too (2026-11-26,
 * the owner). The textures of the model are not in the build: the model draws with the flat color of the spike, which is
 * the shape of a body and not a hole in the view.
 */
export const GENERATOR_MODELS: Readonly<Record<string, string>> = {
  'graph/obj3d/interactive/npc/human_base/human_base.ftl': new URL('assets/human_base.ftl', import.meta.url).href,
}

/**
 * The textures of the model of the player, by the name the containers of the FTL store.
 *
 * @remarks
 * The model draws with the flat color of the spike when a texture of it is missing, and a body of one color is not the
 * character: the generator carries the three textures of `human_base.ftl` (the head, the naked body and the gore) next
 * to the model, so a level made from nothing shows the player the way the game does (2026-11-26, the owner). The file
 * names keep the extension of the data directory (the container of the gore and of the body names a `bmp` that the game
 * stores as a `jpg`): the loader reads the file by the name of the container, and the bytes say what they are.
 */
export const GENERATOR_MODEL_TEXTURES: Readonly<Record<string, string>> = {
  'npc_gore.bmp': new URL('assets/npc_gore.jpg', import.meta.url).href,
  'npc_human_base_hero_head.bmp': new URL('assets/npc_human_base_hero_head.bmp', import.meta.url).href,
  'npc_human_hero_naked_body.bmp': new URL('assets/npc_human_hero_naked_body.jpg', import.meta.url).href,
}

/**
 * The texture a level made from nothing stands on.
 *
 * @remarks
 * It is the one the Arx Level Generator puts under the feet of a new map, so a blank level of the editor and a new
 * map of the generator look the same.
 */
export const BLANK_LEVEL_TEXTURE = 'jorge-[stone].jpg'
