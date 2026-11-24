import type { BaseLight } from './types.ts'

/**
 * The sRGB byte of the white a corner without a palette color takes.
 */
const WHITE = 255

/**
 * The constants of the sRGB curve: the linear part below the knee, then the power curve above it.
 */
const SRGB_THRESHOLD = 0.040_45

const SRGB_SLOPE = 12.92

const SRGB_OFFSET = 0.055

const SRGB_SCALE = 1.055

const SRGB_CURVE = 2.4

/**
 * The linear value of every sRGB byte, the way three converts a vertex color.
 *
 * @remarks
 * The `color` attribute of the level is in the working (linear) color space, the palette and the game's light are in
 * sRGB: the layer adds the two in sRGB and converts the result once. The formula is the one of
 * `three/src/math/ColorManagement.js` (`SRGBToLinear`), read into a table so a frame does not call `Math.pow` three
 * times per corner.
 */
export const SRGB_TO_LINEAR = new Float32Array(256)

for (let value = 0; value < SRGB_TO_LINEAR.length; value = value + 1) {
  const channel = value / 255

  if (channel < SRGB_THRESHOLD) {
    SRGB_TO_LINEAR[value] = channel / SRGB_SLOPE
  } else {
    const base = (channel + SRGB_OFFSET) / SRGB_SCALE

    SRGB_TO_LINEAR[value] = base ** SRGB_CURVE
  }
}

/**
 * The baked color of one corner of the level, in sRGB.
 *
 * @param paletteIndex The palette entry of the corner, or `-1` for a white one.
 * @param source The palette of the level, or the one gray of the flat profile.
 * @param target The array to write the three channels into.
 * @param at The first channel of the corner in the target.
 */
export function writeBaseColor(paletteIndex: number, source: BaseLight, target: Float32Array, at: number): void {
  if (source.flat !== undefined) {
    const value = source.flat * 255

    target[at] = value
    target[at + 1] = value
    target[at + 2] = value

    return
  }

  const color = source.palette[paletteIndex]

  if (color === undefined || paletteIndex < 0) {
    target[at] = WHITE
    target[at + 1] = WHITE
    target[at + 2] = WHITE

    return
  }

  target[at] = color.r
  target[at + 1] = color.g
  target[at + 2] = color.b
}
