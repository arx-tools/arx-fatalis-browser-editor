import { ArxLightFlags, ArxPolygonFlags, type ArxColor, type ArxFTS, type ArxLLF } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { Mesh, Raycaster, Vector3 } from 'three'
import 'three-mesh-bvh'
import { arxVector3toVector3 } from '../arx-threejs-format-converters.js'

/**
 * The same key the generator's `.env` will use (`lightingCalculatorMode`). It decides what ends up
 * in the LLF palette at export time:
 *
 * - `Arx` (the default): the DANAE-like look. Every static light, the ambient floor (the 23/255
 *   ambient is a *minimum*, not something added to the lights), the linear fallStart..fallEnd
 *   falloff, the per-vertex normals and the 0..255 clamp. No shadows - the `.env` describes the
 *   `Arx` mode as "shadows are not cast".
 * - `Realistic`: the `Arx` result with an occlusion test - a light does not reach a vertex if the
 *   scene blocks the ray between them (the ray stops at 99% of the distance, the standard
 *   self-intersection guard of the lighting generators).
 * - `MaxBrightness`: every vertex at 255 (useful for checking edits to a mesh).
 * - `CompleteDarkness`: every vertex at 0 (the darkest state).
 * - `TextureRainbow`: no lighting at all - every vertex gets a **hue from its texture**: the
 *   texture containers of the FTS are ordered, so the earliest ones are red, then yellow, green and
 *   the latest ones blue (`hue = 240 * index / (count - 1)`). Areas that use a late texture (blue)
 *   were added to the level later, which makes the late edits visible (lost media research).
 */
export type LightingCalculatorMode =
  | 'MaxBrightness'
  | 'CompleteDarkness'
  | 'Arx'
  | 'Realistic'
  | 'TextureRainbow'

/** hsv -> rgb, hue in degrees (0..360), saturation and value in 0..1 */
function hsvToRgb(hue: number, saturation: number, value: number): { r: number; g: number; b: number } {
  const chroma = value * saturation
  const h = hue / 60
  const second = chroma * (1 - Math.abs((h % 2) - 1))
  const offset = value - chroma

  let red = 0
  let green = 0
  let blue = 0

  if (h < 1) {
    red = chroma
    green = second
  } else if (h < 2) {
    red = second
    green = chroma
  } else if (h < 3) {
    green = chroma
    blue = second
  } else if (h < 4) {
    green = second
    blue = chroma
  } else if (h < 5) {
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
  }
}

/**
 * The `TextureRainbow` palette: every vertex takes the colour of its polygon's texture container.
 * The order of `fts.textureContainers` is the order the textures were added to the level, so the
 * palette runs from red (the first texture) through yellow and green to blue (the last one).
 */
function bakeTextureRainbowColors(fts: ArxFTS, llf: ArxLLF): ArxColor[] {
  const containers = fts.textureContainers
  const count = containers.length
  const colorByContainerId = new Map<number, ArxColor>()

  containers.forEach((container, index) => {
    const hue = count <= 1 ? 0 : (240 * index) / (count - 1)
    const { r, g, b } = hsvToRgb(hue, 1, 1)

    colorByContainerId.set(container.id, { r, g, b, a: 255 })
  })

  // a texture that is not in the list (should not happen) stays white
  const fallback: ArxColor = { r: 255, g: 255, b: 255, a: 255 }
  const colors: ArxColor[] = llf.colors.map(() => {
    return { ...fallback }
  })

  for (const polygon of fts.polygons) {
    const color = colorByContainerId.get(polygon.textureContainerId) ?? fallback
    const used = isQuad(polygon) ? 4 : 3

    for (let vertexIndex = 0; vertexIndex < used; vertexIndex++) {
      const colorIndex = polygon.vertices[vertexIndex].llfColorIdx

      if (colorIndex !== undefined && colorIndex < colors.length) {
        colors[colorIndex] = { ...color }
      }
    }
  }

  return colors
}

const AMBIENT = Math.round(0.09 * 255) // 23
const GLOBAL_LIGHT_FACTOR = 0.85 // the Arx (Danae) global factor; the Realistic (Fred shadow profiles) uses 1

function clampColor(value: number, ambient: number): number {
  return Math.min(255, Math.max(ambient, Math.round(value)))
}

/**
 * Computes the LLF palette (`llf.colors` order: the FTS polygons' vertices, 3 per triangle + the
 * 4th for a quad) for the given mode.
 *
 * The frame is the editor's relative frame: the FTS vertices are absolute, the LLF lights are scene
 * relative (`scenePosition + lightPosition` is the light in the game's absolute frame).
 */
export function bakeLlfColors(
  fts: ArxFTS,
  llf: ArxLLF,
  mode: LightingCalculatorMode,
  occluders: readonly Mesh[] = [],
  ambientFloor = 0,
  shadows = true,
): ArxColor[] {
  if (mode === 'MaxBrightness') {
    return llf.colors.map(() => ({ r: 255, g: 255, b: 255, a: 255 }))
  }

  if (mode === 'CompleteDarkness') {
    return llf.colors.map(() => ({ r: 0, g: 0, b: 0, a: 255 }))
  }

  if (mode === 'TextureRainbow') {
    return bakeTextureRainbowColors(fts, llf)
  }

  // the *raw* scene position: the vertex of the mesh is `M(v) - M(s)` = `-v.x + s.x`, so the bake
  // must add the un-mirrored `s` here. Using `arxVector3toVector3(mScenePosition)` (which mirrors it)
  // put every vertex one scene-position away from the mesh, so no light reached anything and the
  // whole palette collapsed to the ambient floor.
  const scenePosition = fts.header.mScenePosition
  // the `Arx` (Danae) profile bakes only the static lights - that is what the game's original
  // palette was made of. The `Realistic` follows the Fred `DistanceAngleShadowNoTransparency`
  // profile, which also bakes the `SemiDynamic` lights (they are what lights up the lamps and the
  // torches themselves). Measured on level 11: with the static lights only the palette mean is
  // 50.05, with every light it is 55.11 - exactly the mean of Fred's output for the same level.
  const lights = llf.lights
    .filter((light) => {
      return mode === 'Realistic' || (light.flags & ArxLightFlags.SemiDynamic) === 0
    })
    .map((light) => {
      return { light, position: arxVector3toVector3(light.position) }
    })

  // the `Realistic` (the Fred `DistanceAngleShadowNoTransparency` behaviour) has no ambient floor by
  // default: the shadowed vertices go all the way to 0, which is what makes the shadows solid black.
  // `ambientFloor` (0..64, from the settings / the URL) lifts that: 23 is the floor of the game's
  // original (Danae) palette, which is why the game never looks fully black.
  const ambient = mode === 'Realistic' ? Math.min(255, Math.max(0, Math.round(ambientFloor))) : AMBIENT
  const globalLightFactor = GLOBAL_LIGHT_FACTOR
  // `shadows = false` keeps the occlusion test off: every light reaches every vertex it can see
  // geometrically. That is the Danae-like look (the game's original palette has no occlusion), while
  // `shadows = true` follows Fred's `DistanceAngleShadowNoTransparency` profile.
  const withShadows = mode === 'Realistic' && shadows
  const raycaster = withShadows ? new Raycaster() : undefined
  const blockers = withShadows ? [...occluders] : []
  if (raycaster !== undefined) {
    raycaster.firstHitOnly = true
  }

  const colors: ArxColor[] = new Array(llf.colors.length)
  const vertexPosition = new Vector3()
  const vertexNormal = new Vector3()
  const toLight = new Vector3()

  for (const polygon of fts.polygons) {
    const used = isQuad(polygon) ? 4 : 3
    const doubleSided = (polygon.flags & ArxPolygonFlags.DoubleSided) !== 0

    for (let i = 0; i < used; i++) {
      const vertex = polygon.vertices[i]
      const normal = polygon.normals?.[i] ?? (i < 3 ? polygon.norm : polygon.norm2)
      const colorIndex = vertex.llfColorIdx

      if (colorIndex === undefined) {
        continue
      }

      vertexPosition.set(-vertex.x + scenePosition.x, -vertex.y + scenePosition.y, vertex.z - scenePosition.z)
      vertexNormal.set(-normal.x, -normal.y, normal.z).normalize()

      let r = 0
      let g = 0
      let b = 0

      for (const { light, position } of lights) {
        toLight.subVectors(position, vertexPosition)
        const distance = toLight.length()

        if (distance === 0 || distance > light.fallEnd) {
          continue
        }

        toLight.divideScalar(distance)

        let cosangle = vertexNormal.dot(toLight)

        if (doubleSided) {
          cosangle = Math.abs(cosangle)
        }

        if (cosangle <= 0) {
          continue
        }

        if (raycaster !== undefined && blockers.length > 0) {
          raycaster.set(position, toLight.clone().negate())
          raycaster.far = distance * 0.99

          if (raycaster.intersectObjects(blockers, false).length > 0) {
            continue
          }
        }

        const precalc = light.intensity * globalLightFactor

        if (distance <= light.fallStart) {
          cosangle *= precalc
        } else {
          const p = (light.fallEnd - distance) / (light.fallEnd - light.fallStart)

          if (p <= 0) {
            continue
          }

          cosangle *= p * precalc
        }

        r += light.color.r * cosangle
        g += light.color.g * cosangle
        b += light.color.b * cosangle
      }

      colors[colorIndex] = {
        r: clampColor(r, ambient),
        g: clampColor(g, ambient),
        b: clampColor(b, ambient),
        a: 255,
      }
    }
  }

  return colors
}
