import { type ArxLight, type ArxPolygon, ArxLightFlags } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { Box3, BufferAttribute, Sphere, Vector3 } from 'three'
import type { ArxMap } from '../../../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../../../generator/meshes.ts'
import { blendModeOf, isWater } from '../../../../../../generator/polygons.ts'
import { flatLightOf } from '../../lightingFlat.ts'
import { writeBaseColor } from './color.ts'
import { DYNAMIC_LIGHT_FACTOR, GLOBAL_LIGHT_FACTOR } from './factors.ts'
import type {
  BaseLight,
  DynamicLightModel,
  LightPairSource,
  LightPairs,
  LightWeightSnapshot,
  PairTable,
  VertexLighting,
} from './types.ts'

/**
 * The corners of a quad in the order the solid geometry draws them.
 *
 * @remarks
 * The game stores quads, three.js only knows triangles: the geometry splits the face along `a, b, c` and `c, b, d`, so the
 * second triangle repeats the second and the third corner.
 */
const QUAD_CORNERS: readonly number[] = [0, 1, 2, 2, 1, 3]

/**
 * The corners of a triangle in the order the solid geometry draws them.
 */
const TRIANGLE_CORNERS: readonly number[] = [0, 1, 2]

/**
 * Tells whether a light burns at load and moves at runtime.
 *
 * @remarks
 * The game gives a dynamic copy to every `SemiDynamic` light whose ignition status is on, and the status starts as the
 * opposite of `StartExtinguished` (`LoadLevel.cpp`). A light that starts out is in the level, but it lights nothing
 * until the game ignites it.
 *
 * @param light The light of the LLF.
 *
 * @returns True when the layer may draw the light.
 */
export function isBurningLight(light: ArxLight): boolean {
  if ((light.flags & ArxLightFlags.SemiDynamic) === 0) {
    return false
  }

  return (light.flags & ArxLightFlags.StartExtinguished) === 0
}

/**
 * Tells whether the light of a face may take the dynamic layer.
 *
 * @remarks
 * The game adds the dynamic light of the background only to the face it draws with its own pass: a blended face, a glow
 * or the water is not part of `ApplyTileLights`. The editor's palette gives those faces white, and the layer leaves them
 * alone, so a torch does not light the flat sheet of a river.
 *
 * @param polygon The face of the level.
 *
 * @returns True when the face takes the light of the layer.
 */
function isLightablePolygon(polygon: ArxPolygon): boolean {
  if (isWater(polygon)) {
    return false
  }

  return blendModeOf(polygon) === 'opaque'
}

/**
 * Reads the corners of the solid geometry: which one may take light, and which palette entry it reads.
 *
 * @param map The level to read.
 * @param vertexCount How many corners the solid geometry has.
 *
 * @returns The mask and the palette entries, or `undefined` when the polygons and the geometry do not line up.
 */
function vertexLightingOf(map: ArxMap, vertexCount: number): VertexLighting | undefined {
  const lightMask = new Uint8Array(vertexCount)
  const vertexPalette = new Int32Array(vertexCount).fill(-1)
  const paletteLength = map.llf.colors.length
  let at = 0

  for (const polygon of map.polygons) {
    const lit = isLightablePolygon(polygon)
    let corners = TRIANGLE_CORNERS

    if (isQuad(polygon)) {
      corners = QUAD_CORNERS
    }

    for (const corner of corners) {
      if (at >= vertexCount) {
        return undefined
      }

      if (lit) {
        lightMask[at] = 1

        const paletteIndex = polygon.vertices[corner]?.llfColorIdx

        if (paletteIndex !== undefined && paletteIndex < paletteLength) {
          vertexPalette[at] = paletteIndex
        }
      }

      at = at + 1
    }
  }

  if (at !== vertexCount) {
    return undefined
  }

  return { lightMask, vertexPalette }
}

/**
 * Computes the weight of every light on every corner it reaches.
 *
 * @remarks
 * The weight is the game's `ApplyTileLights`: the cosine of the corner's normal and the light, the falloff between
 * `fallStart` and `fallEnd`, the intensity, and the two factors of the game. A corner turned away takes nothing, and a
 * light without a burning intensity or a falloff reaches nothing.
 *
 * @param source The lights, the corners of the geometry and the mask of the corners that may take light.
 *
 * @returns The pairs, one entry per corner and light.
 */
function lightPairsOf(source: LightPairSource): LightPairs {
  const { lights, positions, normals, lightMask, vertexCount } = source
  const lightOf: number[] = []
  const vertexOf: number[] = []
  const weightOf: number[] = []

  for (const [lightIndex, light] of lights.entries()) {
    const fallRange = light.fallEnd - light.fallStart

    if (light.intensity <= 0 || light.fallEnd <= 0 || fallRange <= 0) {
      continue
    }

    const position = arxVector3toVector3(light.position)
    const lightX = position.x
    const lightY = position.y
    const lightZ = position.z
    const squaredFallEnd = light.fallEnd * light.fallEnd

    for (let vertex = 0; vertex < vertexCount; vertex = vertex + 1) {
      if (lightMask[vertex] === 0) {
        continue
      }

      const corner = vertex * 3
      const dx = lightX - positions[corner]
      const dy = lightY - positions[corner + 1]
      const dz = lightZ - positions[corner + 2]
      const squaredX = dx * dx
      const squaredY = dy * dy
      const squaredZ = dz * dz
      const squaredDistance = squaredX + squaredY + squaredZ

      if (squaredDistance > squaredFallEnd) {
        continue
      }

      const distance = Math.sqrt(squaredDistance)

      if (distance === 0) {
        continue
      }

      const alongX = normals[corner] * dx
      const alongY = normals[corner + 1] * dy
      const alongZ = normals[corner + 2] * dz
      let cosine = (alongX + alongY + alongZ) / distance

      if (cosine <= 0) {
        continue
      }

      if (distance > light.fallStart) {
        cosine = cosine * ((light.fallEnd - distance) / fallRange)
      }

      lightOf.push(lightIndex)
      vertexOf.push(vertex)
      weightOf.push(cosine * light.intensity * GLOBAL_LIGHT_FACTOR * DYNAMIC_LIGHT_FACTOR)
    }
  }

  return { lightOf, vertexOf, weightOf }
}

/**
 * Groups the pairs by the corner of the geometry.
 *
 * @remarks
 * A frame reads the pairs of a corner in one run, so the lists are stored by corner: the vertices the layer touches, the
 * start of the pairs of every one of them, and the light and weight of every pair. The grouping is a counting sort, one
 * walk of the pairs and one of the corners.
 *
 * @param pairs The pairs of the layer.
 * @param vertexCount How many corners the solid geometry has.
 *
 * @returns The table a frame reads.
 */
function pairTableOf(pairs: LightPairs, vertexCount: number): PairTable {
  const { lightOf, vertexOf, weightOf } = pairs
  const pairCount = lightOf.length
  const counts = new Int32Array(vertexCount)

  for (let pair = 0; pair < pairCount; pair = pair + 1) {
    const vertex = vertexOf[pair]

    counts[vertex] = counts[vertex] + 1
  }

  const vertices: number[] = []

  for (let vertex = 0; vertex < vertexCount; vertex = vertex + 1) {
    if (counts[vertex] > 0) {
      vertices.push(vertex)
    }
  }

  const affectedCount = vertices.length
  const affected = Int32Array.from(vertices)
  const starts = new Int32Array(affectedCount + 1)
  const cursors = new Int32Array(vertexCount)

  for (let index = 0; index < affectedCount; index = index + 1) {
    const vertex = affected[index]

    starts[index + 1] = starts[index] + counts[vertex]
    cursors[vertex] = starts[index]
  }

  const pairLights = new Int32Array(pairCount)
  const pairWeights = new Float32Array(pairCount)

  for (let pair = 0; pair < pairCount; pair = pair + 1) {
    const vertex = vertexOf[pair]
    const target = cursors[vertex]

    pairLights[target] = lightOf[pair]
    pairWeights[target] = weightOf[pair]
    cursors[vertex] = target + 1
  }

  return { vertices: affected, starts, pairLights, pairWeights }
}

/**
 * Reads the box of the corners the layer lights.
 *
 * @param vertices The corners of the layer, by their place in the geometry.
 * @param positions The positions of the geometry.
 *
 * @returns The sphere around the lit corners; a point at the origin when the layer lights nothing.
 */
function boundsOf(vertices: Int32Array, positions: Float32Array): Sphere {
  if (vertices.length === 0) {
    return new Sphere(new Vector3(), 0)
  }

  const box = new Box3()

  for (const vertex of vertices) {
    const at = vertex * 3

    box.expandByPoint(new Vector3(positions[at] ?? 0, positions[at + 1] ?? 0, positions[at + 2] ?? 0))
  }

  const sphere = new Sphere()

  box.getBoundingSphere(sphere)

  return sphere
}

/**
 * Builds the dynamic light layer of a level.
 *
 * @remarks
 * The build walks the level once for the light mask and the palette of the corners, once for every burning semi-dynamic
 * light over the corners it may reach, and once to group the pairs by the corner. That is the expensive half of the
 * layer (a good part of a frame on the biggest level), so the frame only reads the result: a geometry or a light change
 * builds the model again, a flicker frame does not.
 *
 * The pair list is stored by corner (`starts`): a corner takes the sum of its lights, which is the same order the game's
 * `ApplyTileLights` adds them in. The weights are in the game's units, so a frame multiplies them with the flicker
 * color of the lights and adds the result to the baked color.
 *
 * @param map The level to read.
 *
 * @returns The model, or `undefined` when the level has no solid geometry to light.
 */
/**
 * Reads the inputs the weights of a light are built from.
 *
 * @param light The light of the level.
 *
 * @returns What a later move, reach, intensity or flag change can tell apart.
 */
function weightsOfLight(light: ArxLight): LightWeightSnapshot {
  return {
    fallEnd: light.fallEnd,
    fallStart: light.fallStart,
    flags: light.flags,
    intensity: light.intensity,
    position: { x: light.position.x, y: light.position.y, z: light.position.z },
  }
}

/**
 * Builds the layer of a level: the weights of the lights on every corner they reach.
 *
 * @param map The level to read.
 *
 * @returns The model, or `undefined` when the level has no solid geometry to light.
 */
export function createDynamicLightModel(map: ArxMap): DynamicLightModel | undefined {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return undefined
  }

  const { geometry } = mesh
  const positionAttribute = geometry.getAttribute('position')
  const normalAttribute = geometry.getAttribute('normal')

  if (!(positionAttribute instanceof BufferAttribute) || !(normalAttribute instanceof BufferAttribute)) {
    return undefined
  }

  if (!(positionAttribute.array instanceof Float32Array) || !(normalAttribute.array instanceof Float32Array)) {
    return undefined
  }

  const vertexCount = positionAttribute.count
  const lighting = vertexLightingOf(map, vertexCount)

  if (lighting === undefined) {
    return undefined
  }

  const lights = map.lights.filter((light) => {
    return isBurningLight(light)
  })
  const pairs = lightPairsOf({
    lights,
    positions: positionAttribute.array,
    normals: normalAttribute.array,
    lightMask: lighting.lightMask,
    vertexCount,
  })
  const table = pairTableOf(pairs, vertexCount)
  const source: BaseLight = { flat: flatLightOf(map), palette: map.llf.colors }
  const paletteIndexes = new Int32Array(table.vertices.length)
  const baseColors = new Float32Array(table.vertices.length * 3)

  for (let index = 0; index < table.vertices.length; index = index + 1) {
    const paletteIndex = lighting.vertexPalette[table.vertices[index]]

    paletteIndexes[index] = paletteIndex
    writeBaseColor(paletteIndex, source, baseColors, index * 3)
  }

  return {
    map,
    vertexCount,
    positionAttribute,
    positionVersion: positionAttribute.version,
    normalAttribute,
    normalVersion: normalAttribute.version,
    lights,
    weightSnapshot: lights.map((light) => {
      return weightsOfLight(light)
    }),
    vertices: table.vertices,
    starts: table.starts,
    pairLights: table.pairLights,
    pairWeights: table.pairWeights,
    paletteIndexes,
    baseColors,
    lightColors: new Float32Array(lights.length * 3),
    bounds: boundsOf(table.vertices, positionAttribute.array),
    lightMask: lighting.lightMask,
    vertexPalette: lighting.vertexPalette,
    lightBase: source,
  }
}
