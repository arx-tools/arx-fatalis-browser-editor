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
 * The texture a level made from nothing stands on.
 *
 * @remarks
 * It is the one the Arx Level Generator puts under the feet of a new map, so a blank level of the editor and a new
 * map of the generator look the same.
 */
export const BLANK_LEVEL_TEXTURE = 'jorge-[stone].jpg'
