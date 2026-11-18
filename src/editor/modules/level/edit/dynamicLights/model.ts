import { ArxLightFlags, type ArxColor, type ArxLight, type ArxPolygon } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { Box3, BufferAttribute, MathUtils, Sphere, Vector3, type BufferGeometry } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import { arxVector3toVector3 } from '../../../../../generator/meshes.ts'
import { blendModeOf, isWater } from '../../../../../generator/polygons.ts'
import { flatLightOf } from '../lightingFlat.ts'

/**
 * The global factor of the light of the game (`GLOBAL_LIGHT_FACTOR` in `src/scene/Light.cpp`).
 */
const GLOBAL_LIGHT_FACTOR = 0.85

/**
 * The factor the game gives the dynamic light of the background (`ApplyTileLights`).
 *
 * @remarks
 * The static palette was baked without it; the runtime layer adds this half of the light on top.
 */
const DYNAMIC_LIGHT_FACTOR = 0.5

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
 * The sRGB byte of the white a corner without a palette colour takes.
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
 * The linear value of every sRGB byte, the way three converts a vertex colour.
 *
 * @remarks
 * The `color` attribute of the level is in the working (linear) colour space, the palette and the game's light are in
 * sRGB: the layer adds the two in sRGB and converts the result once. The formula is the one of
 * `three/src/math/ColorManagement.js` (`SRGBToLinear`), read into a table so a frame does not call `Math.pow` three
 * times per corner.
 */
const SRGB_TO_LINEAR = new Float32Array(256)

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
 * A light colour of the layer, in sRGB, from 0 to 255.
 */
export type DynamicLightColor = {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * The baked colour of the corners of a level, from the palette or from the flat profile.
 */
type BaseLight = {
  readonly flat: number | undefined
  readonly palette: readonly ArxColor[]
}

/**
 * What the corners of the solid geometry are to the layer: which one may take light, and which palette entry it reads.
 */
type VertexLighting = {
  readonly lightMask: Uint8Array
  readonly vertexPalette: Int32Array
}

/**
 * The light of every corner-light pair, before the pairs are grouped by corner.
 */
type LightPairs = {
  readonly lightOf: number[]
  readonly vertexOf: number[]
  readonly weightOf: number[]
}

/**
 * What the pair builder reads: the lights that burn, the corners of the solid geometry and the mask of the corners that
 * may take light.
 */
type LightPairSource = {
  readonly lights: readonly ArxLight[]
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly lightMask: Uint8Array
  readonly vertexCount: number
}

/**
 * The pairs of the layer, grouped by the corner of the geometry.
 */
type PairTable = {
  readonly vertices: Int32Array
  readonly starts: Int32Array
  readonly pairLights: Int32Array
  readonly pairWeights: Float32Array
}

/**
 * The dynamic light layer of a level: which corner takes how much light from which semi-dynamic light.
 *
 * @remarks
 * The geometry of the level is fixed while the flicker runs, so the work of the layer is split: this model holds what
 * can be computed once (the weight of every light on every corner it reaches) and a frame only multiplies those weights
 * with the flicker colour of the lights. The model is built again when the geometry, the lights or the palette change;
 * the weights are stored per corner of the **drawn** geometry, so the colour attribute can be written without walking
 * the polygons again.
 */
export type DynamicLightModel = {
  /**
   * The level the model belongs to: a change of the map builds the model again.
   */
  readonly map: ArxMap
  /**
   * How many vertices the solid geometry had at the build.
   */
  readonly vertexCount: number
  /**
   * The position attribute the weights were built from, and its version: a moved face or a new geometry is a new build.
   */
  readonly positionAttribute: BufferAttribute
  readonly positionVersion: number
  /**
   * The normal attribute the weights were built from, and its version.
   */
  readonly normalAttribute: BufferAttribute
  readonly normalVersion: number
  /**
   * The semi-dynamic lights that burn at load, in the order the pairs name them.
   *
   * @remarks
   * The list is the lights of the map, and a light edit replaces them in the LLF: the entries are the ones the weights
   * were built from, and a colour that changed only swaps the entries (see {@link refreshDynamicLightLights}).
   */
  readonly lights: ArxLight[]
  /**
   * The vertices the layer touches, in ascending order of the geometry.
   */
  readonly vertices: Int32Array
  /**
   * Where the pairs of the vertex `i` start in {@link pairLights}, and where they end at `i + 1`.
   */
  readonly starts: Int32Array
  /**
   * The light of every pair, by its index in {@link lights}.
   */
  readonly pairLights: Int32Array
  /**
   * The weight of every pair: the cosine, the falloff, the intensity and the factors of the game, multiplied once.
   */
  readonly pairWeights: Float32Array
  /**
   * The palette entry of every affected vertex, or `-1` when the corner takes no palette colour (a white one).
   */
  readonly paletteIndexes: Int32Array
  /**
   * The baked colour of every affected vertex in sRGB, from 0 to 255, three channels each.
   *
   * @remarks
   * The palette of the level is the light the game's own editor baked, and the layer adds its light to it. The flat
   * profile writes one grey on every corner, and the model follows it: the flat value is not a palette entry.
   */
  readonly baseColors: Float32Array
  /**
   * The colour of the lights of the current frame, three channels each, reused by every update.
   */
  readonly lightColors: Float32Array
  /**
   * The box of the corners the layer lights, in the frame of the scene.
   *
   * @remarks
   * The layer writes the colour of these corners on every frame of the flicker, and the frame is worth it only when a
   * view can see one of them: a walkable view that looks at a room with no burning light has nothing to draw, and the
   * cull of the frame tests this sphere against its frustum (2026-11-18, the owner).
   */
  readonly bounds: Sphere
}

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
 * The colour of a light in one frame of the flicker.
 *
 * @remarks
 * The game's `TreatBackgroundDynlights` subtracts a random part of the colour every frame:
 * `rgb = rgb - rgb * ex_flicker * randomColor3f() * 0.5`, channel by channel, and the result never goes below zero
 * (the random is at least zero). The random of the game is not reproducible, and the flicker follows the frame rate:
 * this is the same formula on the random the caller gives.
 *
 * @param light The light of the LLF.
 * @param random A random number from 0 to 1, called three times: once for each channel.
 *
 * @returns The colour of the frame in sRGB, from 0 to 255.
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
 * The baked colour of one corner of the level, in sRGB.
 *
 * @param paletteIndex The palette entry of the corner, or `-1` for a white one.
 * @param source The palette of the level, or the one grey of the flat profile.
 * @param target The array to write the three channels into.
 * @param at The first channel of the corner in the target.
 */
function writeBaseColor(paletteIndex: number, source: BaseLight, target: Float32Array, at: number): void {
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
 * colour of the lights and adds the result to the baked colour.
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
    vertices: table.vertices,
    starts: table.starts,
    pairLights: table.pairLights,
    pairWeights: table.pairWeights,
    paletteIndexes,
    baseColors,
    lightColors: new Float32Array(lights.length * 3),
    bounds: boundsOf(table.vertices, positionAttribute.array),
  }
}

/**
 * Tells whether the geometry of the level changed under the model.
 *
 * @remarks
 * The level keeps its geometry and refills its buffers in place, so a `BufferAttribute` can stay the same object while
 * its content changes: the version of the attribute tells a moved face (a translate, a turn, a scale) and the version
 * of the normals follows it. A new geometry (a delete, a fill) is a new attribute, and the count says it too.
 *
 * @param model The model to check.
 * @param geometry The geometry the model was built from.
 *
 * @returns True when the weights of the model no longer belong to the geometry.
 */
export function isDynamicLightModelStale(model: DynamicLightModel, geometry: BufferGeometry): boolean {
  const positionAttribute = geometry.getAttribute('position')
  const normalAttribute = geometry.getAttribute('normal')

  if (positionAttribute !== model.positionAttribute || normalAttribute !== model.normalAttribute) {
    return true
  }

  if (positionAttribute.version !== model.positionVersion || normalAttribute.version !== model.normalVersion) {
    return true
  }

  return positionAttribute.count !== model.vertexCount
}

/**
 * Reads the baked colour of the corners of the layer again.
 *
 * @remarks
 * A change of the lighting profile rewrites the palette (and the flat light), but the weights of the layer are the same:
 * the geometry and the lights did not move. The base colours are the palette by the corner, so this is a walk of the
 * affected corners instead of a build of the whole pair list.
 *
 * @param model The model whose base colours are rewritten.
 * @param map The level the model belongs to.
 */
export function refreshDynamicLightBaseColors(model: DynamicLightModel, map: ArxMap): void {
  const source: BaseLight = { flat: flatLightOf(map), palette: map.llf.colors }

  for (let index = 0; index < model.paletteIndexes.length; index = index + 1) {
    writeBaseColor(model.paletteIndexes[index], source, model.baseColors, index * 3)
  }
}

/**
 * Tells whether two states of a light throw the same light on a corner.
 *
 * @remarks
 * The weights of the layer are the cosine, the falloff, the intensity and the factors of the game, multiplied once: the
 * place, the two radii, the intensity and the flags of a light are what they were built from. The colour and the flicker
 * are read on every frame, so a build is not needed when only those changed.
 *
 * @param one The state the weights were built from.
 * @param other The state of the level now.
 *
 * @returns True when the two give the same weights.
 */
function sameWeightsOf(one: ArxLight, other: ArxLight): boolean {
  return (
    one.position.x === other.position.x &&
    one.position.y === other.position.y &&
    one.position.z === other.position.z &&
    one.fallStart === other.fallStart &&
    one.fallEnd === other.fallEnd &&
    one.intensity === other.intensity &&
    one.flags === other.flags
  )
}

/**
 * Takes the new colour of the lights into a built model, without building it again.
 *
 * @remarks
 * The light editor writes a light on the frame of every input, and the layer draws the light of the model: the build of
 * the pairs is the expensive half of the layer (a good part of a frame on a big level), so a colour that changed only
 * swaps the light the model reads and moves the base colours with the palette. A light that moved, changed its reach,
 * its intensity or its flags gives the same answer as a rebuild: the weights are stale.
 *
 * @param model The model that takes the lights.
 * @param map The level the model belongs to.
 *
 * @returns True when the model took the lights, false when the layer needs a build.
 */
export function refreshDynamicLightLights(model: DynamicLightModel, map: ArxMap): boolean {
  const burning = map.lights.filter((light) => {
    return isBurningLight(light)
  })

  if (burning.length !== model.lights.length) {
    return false
  }

  for (const [index, light] of burning.entries()) {
    const built = model.lights[index]

    if (built === undefined || !sameWeightsOf(built, light)) {
      return false
    }
  }

  model.lights.splice(0, model.lights.length, ...burning)
  refreshDynamicLightBaseColors(model, map)

  return true
}

/**
 * Writes the current light of the layer into the colour attribute of the level.
 *
 * @remarks
 * A frame reads the flicker colour of every light once, then adds the weighted colour of its pairs to the baked colour
 * of the corner, clamps it to the byte range and turns it into the working colour space. The attribute is marked dirty,
 * so the renderer uploads it on the next frame.
 *
 * The switch of the static lights decides whether the baked colour of the corner is the base of the sum: without it the
 * layer draws in the dark, and the whole level is as dark as the corners the torches do not reach.
 *
 * @param model The model of the level.
 * @param geometry The geometry of the solid mesh.
 * @param random A random number from 0 to 1 for the flicker.
 * @param withStaticLights Whether the baked colour of the level is under the layer.
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

  if (attribute.count !== model.vertexCount || model.vertices.length === 0) {
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

  attribute.needsUpdate = true

  return true
}

/**
 * Draws the level black: the baked colour of every corner goes away, and nothing lights it.
 *
 * @remarks
 * The switch of the static lights turns the baked palette off, so the level is dark under the dynamic layer: the whole
 * colour attribute goes to zero, the blended and the water faces included. The palette itself is not changed; turning the
 * switch back on writes it with `writeBakedColors`.
 *
 * @param geometry The geometry of the solid mesh.
 *
 * @returns True when the attribute was written, false when the geometry has no colour attribute of the layer.
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
