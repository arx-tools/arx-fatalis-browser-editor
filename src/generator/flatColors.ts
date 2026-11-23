import { Color, SRGBColorSpace } from 'three'
import flatColors from './flat-colors.json' with { type: 'json' }

/**
 * The flat color of one of the textures of the game, in sRGB, one byte per channel.
 */
export type FlatColor = readonly [number, number, number]

/**
 * The line of a texture the table does not know, in the color of the vertices.
 *
 * @remarks
 * A mod, or a custom texture a level brings in a zip: there is no flat color to invert, so the line is the white of
 * the dark faces (most of the game's textures are dark).
 */
const LINE_OF_UNKNOWN_TEXTURE: FlatColor = [1, 1, 1]

/**
 * The luminance where a flat color counts as dark, in display values.
 *
 * @remarks
 * A dark face takes a light line, a light one a dark line: it is the old black-and-white rule of the wireframe, and it
 * is what keeps the line readable whatever the texture is.
 */
const THRESHOLD = 0.5

/**
 * The lightness of the line over a dark face, and over a light one, in display values.
 *
 * @remarks
 * The line is not pure white or black: the hue of the face's inverse stays on it, so the two ends are a light and a
 * dark tint of that hue. The values are close to the ends of the range, so the contrast is the one the black-and-white
 * wireframe had.
 */
const LIGHT_LINE_LIGHTNESS = 0.78
const DARK_LINE_LIGHTNESS = 0.22

/**
 * The saturation the line keeps at least, in display values.
 *
 * @remarks
 * A texture with little color (a gray stone) would give a gray line, and the point of the inversion is the color: the
 * line is pushed toward a saturated hue of the face's inverse. A quarter to a half is a tint, not a neon line (the
 * owner lowered it from 0.6 to 0.45 the same evening).
 */
const MIN_LINE_SATURATION = 0.45

/**
 * The flat color of every texture of the game, by its name in lower case.
 *
 * @remarks
 * The names of the textures come from two places (the containers of the level and the file names the browser reads),
 * and they may differ in case only: the table is matched without case, the way the data directory is.
 */
const gameColorsByName = new Map<string, FlatColor>()

for (const [name, channels] of Object.entries(flatColors)) {
  const [red, green, blue] = channels

  if (red === undefined || green === undefined || blue === undefined) {
    continue
  }

  gameColorsByName.set(name.toLowerCase(), [red, green, blue])
}

/**
 * The flat colors of the textures the table does not know, by their name in lower case.
 *
 * @remarks
 * A level may bring its own textures (a zip of a custom level, a file the user drops, a texture of a modded data
 * directory): those are not in the table of the game, so their color is the **average of their own pixels**, computed
 * when the image is decoded (see `averageColorOfImage`). The map is filled at runtime and the last file of a name wins:
 * two levels may bring a texture of the same name with different pictures.
 */
const registeredColorsByName = new Map<string, FlatColor>()

/**
 * Whether the table of the game knows the flat color of a texture.
 *
 * @remarks
 * A texture the table knows takes the color of the table (the game's files are what it was made from), so the editor
 * does not read its pixels: only the textures of a level that are not the game's are averaged.
 *
 * @param textureName The name of the texture, the way the level stores it.
 *
 * @returns True when the table has the color of the texture.
 */
export function hasGameFlatColor(textureName: string): boolean {
  return gameColorsByName.has(textureName.toLowerCase())
}

/**
 * Registers the flat color of a texture the table does not know.
 *
 * @remarks
 * The color comes from the average of the pixels of the file the level brought (see `averageColorOfImage`). A later
 * registration of the same name replaces the earlier one, so the texture of the level on the screen is the one that
 * decides the color of its wireframe.
 *
 * @param textureName The name of the texture, the way the level stores it.
 * @param color The flat color, sRGB bytes.
 */
export function registerFlatColor(textureName: string, color: FlatColor): void {
  registeredColorsByName.set(textureName.toLowerCase(), color)
}

/**
 * Forgets every flat color registered at runtime.
 *
 * @remarks
 * A test seam: the registry is a module level map, and a test that registers a color would leave it for the next one.
 * The editor does not clear it, because the last file of a name is the one on the screen.
 */
export function clearRegisteredFlatColors(): void {
  registeredColorsByName.clear()
}

/**
 * Reads the flat color of a texture: the average of its pixels, which is what the flat mode of the game paints the
 * faces with.
 *
 * @remarks
 * The table is the one of the **Underworld** (UW) mode of the game (the reference is Ultima Underworld): every texture
 * has one color, so a face reads as the texture it draws and the level stays readable without the textures. A texture
 * of the table is always read from the table; a texture the table does not know takes the color registered for it (the
 * average of its file), when there is one. The values are sRGB bytes, `0..255` per channel.
 *
 * @param textureName The name of the texture, the way the level stores it.
 *
 * @returns The flat color, or `undefined` when neither the table nor the registry knows the texture.
 */
export function flatColorOf(textureName: string): FlatColor | undefined {
  const registered = registeredColorsByName.get(textureName.toLowerCase())

  if (registered !== undefined) {
    return registered
  }

  return gameColorsByName.get(textureName.toLowerCase())
}

/**
 * Reads the luminance of a flat color, in display values.
 *
 * @param color The flat color, sRGB bytes.
 *
 * @returns The luminance, `0..1`.
 */
function luminanceOf(color: FlatColor): number {
  const red = 0.2126 * color[0]
  const green = 0.7152 * color[1]
  const blue = 0.0722 * color[2]

  return (red + green + blue) / 255
}

/**
 * Reads the color the wireframe draws a face with: the **inverse hue** of the flat color of its texture.
 *
 * @remarks
 * The line takes the opposite side of the color wheel (a brown floor gets a blue-lilac line, a green wall a red one),
 * with the lightness at the other end of the face: a dark face gets a light line, a light one a dark line. The exact
 * complement is too pale on the middle tones (both the face and its inverse sit around half the range), so the
 * lightness is forced to the end the contrast needs, and the saturation is kept from turning the line gray.
 *
 * A texture no flat color is known for (neither the table nor the registry) has nothing to invert, so it gets the
 * white line of the dark faces: the editor registers the average of a custom texture when it decodes the file.
 *
 * @param textureName The name of the texture of the face.
 *
 * @returns The color of the line, in the linear space of the vertex colors three draws with.
 */
export function wireframeLineColorOf(textureName: string | undefined): FlatColor {
  if (textureName === undefined) {
    return LINE_OF_UNKNOWN_TEXTURE
  }

  const flat = flatColorOf(textureName)

  if (flat === undefined) {
    return LINE_OF_UNKNOWN_TEXTURE
  }

  const color = new Color().setRGB(flat[0] / 255, flat[1] / 255, flat[2] / 255, SRGBColorSpace)
  const hsl = { h: 0, s: 0, l: 0 }

  color.getHSL(hsl, SRGBColorSpace)

  let lightness = LIGHT_LINE_LIGHTNESS

  if (luminanceOf(flat) >= THRESHOLD) {
    lightness = DARK_LINE_LIGHTNESS
  }

  const line = new Color().setHSL((hsl.h + 0.5) % 1, Math.max(hsl.s, MIN_LINE_SATURATION), lightness, SRGBColorSpace)

  return [line.r, line.g, line.b]
}
