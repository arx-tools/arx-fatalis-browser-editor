import {
  type ArxColor,
  type ArxFTS,
  type ArxLLF,
  type ArxLight,
  type ArxPolygon,
  ArxLightFlags,
} from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { type Vector3, MathUtils } from 'three'
import type { LightingCalculatorMode } from '../types.ts'
import { arxVector3toVector3 } from '../meshes.ts'

/**
 * The ambient floor of the game-like profile: 9% of white, the floor of the game's own palette (Danae).
 */
const AMBIENT = Math.round(0.09 * 255)

/**
 * The global factor of the game-like profile (Danae); the realistic profile uses one.
 */
export const GLOBAL_LIGHT_FACTOR = 0.85

/**
 * The saturation of the `TextureRainbow` palette: 100% looked too harsh on the screen.
 */
const RAINBOW_SATURATION = 0.75

/**
 * The number of colors a polygon owns in the palette: one per corner, so three or four.
 *
 * @param polygon The face to read.
 *
 * @returns The number of its corners in the palette.
 */
export function colorCountOf(polygon: ArxPolygon): number {
  if (isQuad(polygon)) {
    return 4
  }

  return 3
}

/**
 * The normal of one corner of a face.
 *
 * @remarks
 * A face may carry a normal for every corner (the curved ones do); otherwise the first three corners take the face's
 * normal and the fourth one the second normal, the way the renderer reads them.
 *
 * @param polygon The face whose corners are read.
 * @param index The position of the corner in the face, from zero.
 *
 * @returns The direction the face points at that corner, as the file gave it.
 */
export function normalOfCorner(polygon: ArxPolygon, index: number): ArxPolygon['norm'] {
  const baked = polygon.normals?.[index]

  if (baked !== undefined) {
    return baked
  }

  if (index < 3) {
    return polygon.norm
  }

  return polygon.norm2
}

/**
 * The falloff of a light at a distance: one inside its full radius, then a line down to zero at its end.
 *
 * @param light The light to read.
 * @param distance How far the corner is from it.
 *
 * @returns The factor of the falloff, or `undefined` when the light does not reach the corner.
 */
export function falloffOf(light: ArxLight, distance: number): number | undefined {
  if (distance <= light.fallStart) {
    return 1
  }

  const factor = (light.fallEnd - distance) / (light.fallEnd - light.fallStart)

  if (factor <= 0) {
    return undefined
  }

  return factor
}

/**
 * Turns a hue, a saturation and a value into a color of 0..255.
 *
 * @param hue The hue, in degrees.
 * @param saturation The saturation, from 0 to 1.
 * @param value The brightness, from 0 to 1.
 *
 * @returns The color.
 */
function hsvToRgb(hue: number, saturation: number, value: number): ArxColor {
  const chroma = value * saturation
  const sector = (hue / 60) % 2
  const second = chroma * (1 - Math.abs(sector - 1))
  const offset = value - chroma
  let red = 0
  let green = 0
  let blue = 0

  if (hue < 60) {
    red = chroma
    green = second
  } else if (hue < 120) {
    red = second
    green = chroma
  } else if (hue < 180) {
    green = chroma
    blue = second
  } else if (hue < 240) {
    green = second
    blue = chroma
  } else if (hue < 300) {
    red = second
    blue = chroma
  } else {
    red = chroma
    blue = second
  }

  return {
    r: Math.round((red + offset) * 255),
    g: Math.round((green + offset) * 255),
    b: Math.round((blue + offset) * 255),
    a: 255,
  }
}

/**
 * The `TextureRainbow` palette: every corner takes a hue from the container of its texture.
 *
 * @remarks
 * The containers of the FTS are in the order the textures were added to the level, so the first ones are red (the
 * oldest) and the last ones blue (the newest): a place whose textures are late was added later, which makes the late
 * edits visible. It is a check mode, not a look for the game.
 *
 * @param fts The scene of the level.
 * @param llf The lighting of the level.
 * @param luminosity The value of the colors, from 0 (black) to 1 (the full color of the hue).
 *
 * @returns The palette, one color per entry.
 */
export function bakeTextureRainbow(fts: ArxFTS, llf: ArxLLF, luminosity: number): ArxColor[] {
  const containers = fts.textureContainers
  const count = containers.length
  const colorOfContainer = new Map<number, ArxColor>()

  for (const [index, container] of containers.entries()) {
    let hue = 0

    if (count > 1) {
      hue = (240 * index) / (count - 1)
    }

    colorOfContainer.set(container.id, hsvToRgb(hue, RAINBOW_SATURATION, luminosity))
  }

  const fallback: ArxColor = { r: 255, g: 255, b: 255, a: 255 }
  const colors: ArxColor[] = llf.colors.map(() => {
    return { ...fallback }
  })

  for (const polygon of fts.polygons) {
    const color = colorOfContainer.get(polygon.textureContainerId) ?? fallback

    for (let index = 0; index < colorCountOf(polygon); index = index + 1) {
      const colorIndex = polygon.vertices[index].llfColorIdx

      if (colorIndex !== undefined && colorIndex < colors.length) {
        colors[colorIndex] = { ...color }
      }
    }
  }

  return colors
}

/**
 * The lights a profile bakes.
 *
 * @remarks
 * Both profiles bake only the static lights, which is what the game's own palette was made of: a torch is a semidynamic
 * light, and the game lights it up at runtime (2026-11-16, the owner's decision: the realistic profile does not put
 * them into the palette either, then the game does not double them). The profiles differ in the factor (the game's 0.85
 * against the true 1) and in the options of the realistic one (the ambient floor, the shadows).
 *
 * @param llf The lighting of the level.
 *
 * @returns The lights, with their position in the scene's frame.
 */
export function collectLights(llf: ArxLLF): Array<{ light: ArxLight; position: Vector3 }> {
  return llf.lights
    .filter((light) => {
      return (light.flags & ArxLightFlags.SemiDynamic) === 0
    })
    .map((light) => {
      return { light, position: arxVector3toVector3(light.position) }
    })
}

/**
 * The lowest value of a baked color for a profile.
 *
 * @param mode The profile of the bake.
 * @param ambientFloor The setting of the realistic profile.
 *
 * @returns The floor, from 0 to 255.
 */
export function ambientOf(mode: LightingCalculatorMode, ambientFloor: number): number {
  if (mode === 'Realistic') {
    return MathUtils.clamp(Math.round(ambientFloor), 0, 255)
  }

  return AMBIENT
}
