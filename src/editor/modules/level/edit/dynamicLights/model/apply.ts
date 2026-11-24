import type { ArxLight } from 'arx-convert/types'
import { type BufferGeometry, BufferAttribute, MathUtils } from 'three'
import { SRGB_TO_LINEAR } from './color.ts'
import { applyLiveLights } from './live.ts'
import type { DynamicLightColor, DynamicLightModel } from './types.ts'

/**
 * The color of a light in one frame of the flicker.
 *
 * @remarks
 * The game's `TreatBackgroundDynlights` subtracts a random part of the color every frame:
 * `rgb = rgb - rgb * ex_flicker * randomColor3f() * 0.5`, channel by channel, and the result never goes below zero
 * (the random is at least zero). The random of the game is not reproducible, and the flicker follows the frame rate:
 * this is the same formula on the random the caller gives.
 *
 * @param light The light of the LLF.
 * @param random A random number from 0 to 1, called three times: once for each channel.
 *
 * @returns The color of the frame in sRGB, from 0 to 255.
 */
export function flickerColorOf(light: ArxLight, random: () => number): DynamicLightColor {
  const flicker = {
    r: light.exFlicker.r / 255,
    g: light.exFlicker.g / 255,
    b: light.exFlicker.b / 255,
  }
  const redPart = flicker.r * random() * 0.5
  const greenPart = flicker.g * random() * 0.5
  const bluePart = flicker.b * random() * 0.5

  return {
    r: light.color.r * (1 - redPart),
    g: light.color.g * (1 - greenPart),
    b: light.color.b * (1 - bluePart),
  }
}

/**
 * Writes the current light of the layer into the color attribute of the level.
 *
 * @remarks
 * A frame reads the flicker color of every light once, then adds the weighted color of its pairs to the baked color
 * of the corner, clamps it to the byte range and turns it into the working color space. The attribute is marked dirty,
 * so the renderer uploads it on the next frame.
 *
 * The switch of the static lights decides whether the baked color of the corner is the base of the sum: without it the
 * layer draws in the dark, and the whole level is as dark as the corners the torches do not reach.
 *
 * @param model The model of the level.
 * @param geometry The geometry of the solid mesh.
 * @param random A random number from 0 to 1 for the flicker.
 * @param withStaticLights Whether the baked color of the level is under the layer.
 *
 * @returns True when the attribute was written, false when the geometry is not the one of the model.
 */
export function applyDynamicLightModel(
  model: DynamicLightModel,
  geometry: BufferGeometry,
  random: () => number,
  withStaticLights: boolean,
): boolean {
  const attribute = geometry.getAttribute('color')

  if (!(attribute instanceof BufferAttribute)) {
    return false
  }

  if (attribute.itemSize !== 3 || !(attribute.array instanceof Float32Array)) {
    return false
  }

  if (attribute.count !== model.vertexCount) {
    return false
  }

  // a level whose lights reached no corner at the build still has the ones a drag put on the layer
  if (model.vertices.length === 0 && (model.live === undefined || model.live.actives.length === 0)) {
    return false
  }

  for (const [index, light] of model.lights.entries()) {
    const color = flickerColorOf(light, random)
    const at = index * 3

    model.lightColors[at] = color.r
    model.lightColors[at + 1] = color.g
    model.lightColors[at + 2] = color.b
  }

  const colors = attribute.array

  for (let index = 0; index < model.vertices.length; index = index + 1) {
    const base = index * 3
    let red = 0
    let green = 0
    let blue = 0

    if (withStaticLights) {
      red = model.baseColors[base]
      green = model.baseColors[base + 1]
      blue = model.baseColors[base + 2]
    }

    for (let pair = model.starts[index]; pair < model.starts[index + 1]; pair = pair + 1) {
      const light = model.pairLights[pair] * 3
      const weight = model.pairWeights[pair]
      const redPart = weight * model.lightColors[light]
      const greenPart = weight * model.lightColors[light + 1]
      const bluePart = weight * model.lightColors[light + 2]

      red = red + redPart
      green = green + greenPart
      blue = blue + bluePart
    }

    const at = model.vertices[index] * 3

    colors[at] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(red), 0, 255)]
    colors[at + 1] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(green), 0, 255)]
    colors[at + 2] = SRGB_TO_LINEAR[MathUtils.clamp(Math.round(blue), 0, 255)]
  }

  applyLiveLights(model, colors, withStaticLights)

  attribute.needsUpdate = true

  return true
}

/**
 * Draws the level black: the baked color of every corner goes away, and nothing lights it.
 *
 * @remarks
 * The switch of the static lights turns the baked palette off, so the level is dark under the dynamic layer: the whole
 * color attribute goes to zero, the blended and the water faces included. The palette itself is not changed; turning the
 * switch back on writes it with `writeBakedColors`.
 *
 * @param geometry The geometry of the solid mesh.
 *
 * @returns True when the attribute was written, false when the geometry has no color attribute of the layer.
 */
export function blackenDynamicLightModel(geometry: BufferGeometry): boolean {
  const attribute = geometry.getAttribute('color')

  if (!(attribute instanceof BufferAttribute)) {
    return false
  }

  if (attribute.itemSize !== 3 || !(attribute.array instanceof Float32Array)) {
    return false
  }

  attribute.array.fill(0)
  attribute.needsUpdate = true

  return true
}
