import { ArxLightFlags, type ArxColor, type ArxFTS, type ArxLLF } from 'arx-convert/types'
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
 */
export type LightingCalculatorMode = 'MaxBrightness' | 'CompleteDarkness' | 'Arx' | 'Realistic'

const AMBIENT = Math.round(0.09 * 255) // 23
const GLOBAL_LIGHT_FACTOR = 0.85

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
): ArxColor[] {
  if (mode === 'MaxBrightness') {
    return llf.colors.map(() => ({ r: 255, g: 255, b: 255, a: 255 }))
  }

  if (mode === 'CompleteDarkness') {
    return llf.colors.map(() => ({ r: 0, g: 0, b: 0, a: 255 }))
  }

  const scenePosition = arxVector3toVector3(fts.header.mScenePosition)
  const lights = llf.lights
    .filter((light) => {
      return (light.flags & ArxLightFlags.SemiDynamic) === 0
    })
    .map((light) => {
      return { light, position: arxVector3toVector3(light.position) }
    })

  // the `Realistic` (the Fred `DistanceAngleShadowNoTransparency` behaviour) has no ambient floor:
  // the shadowed vertices go all the way to 0, which is what makes the shadows solid black
  const ambient = mode === 'Realistic' ? 0 : AMBIENT
  const raycaster = mode === 'Realistic' ? new Raycaster() : undefined
  const blockers = mode === 'Realistic' ? [...occluders] : []
  if (raycaster !== undefined) {
    raycaster.firstHitOnly = true
  }

  const colors: ArxColor[] = new Array(llf.colors.length)
  const vertexPosition = new Vector3()
  const vertexNormal = new Vector3()
  const toLight = new Vector3()

  for (const polygon of fts.polygons) {
    const used = isQuad(polygon) ? 4 : 3

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

        if (distance === 0 || distance >= light.fallEnd) {
          continue
        }

        toLight.divideScalar(distance)

        let cosangle = vertexNormal.dot(toLight)

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

        const precalc = light.intensity * GLOBAL_LIGHT_FACTOR

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
