import type { ArxColor, ArxLight } from 'arx-convert/types'
import type { BufferAttribute, Sphere } from 'three'
import type { ArxMap } from '../../../../../../generator/ArxMap.ts'
import { refreshDynamicLightLights } from './refresh.ts'

/**
 * A light color of the layer, in sRGB, from 0 to 255.
 */
export type DynamicLightColor = {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * One light of a drag, with the corners it lights and the weight of the light on every one of them.
 *
 * @remarks
 * The lists are dense and grow with the light: a corner is in them once, and the order is the order of the geometry,
 * so a frame can walk them beside the corners of the build without sorting anything.
 */
export type LiveLight = {
  readonly lightIndex: number
  vertices: Int32Array
  weights: Float32Array
  count: number
}

/**
 * The light of the lights that moved after the build.
 *
 * @remarks
 * A drag writes the place of a light on every frame, and the build of the pairs is the expensive half of the layer (141
 * ms on the level 2 with its 89 lights): a moved light keeps its own list of corners instead, and a frame adds it over
 * the table of the build. The pairs the build made for that light are zeroed, so the light is drawn once. The next
 * build takes every light in again and drops the layer.
 */
export type LiveLayer = {
  /**
   * The lights of the layer by their place in {@link DynamicLightModel.lights}.
   */
  readonly lights: Array<LiveLight | undefined>
  /**
   * The lights of the layer, in the order they went live.
   */
  readonly actives: LiveLight[]
  /**
   * Whether the pairs of a light of the build are zeroed already: a light goes live once, and a later frame of its own
   * drag only rewrites its list.
   */
  readonly isOverridden: Uint8Array
  /**
   * Where a corner sits in the table of the build, or `-1` when the layer does not light it.
   *
   * @remarks
   * The table is dense over the corners the build found, and a light that moves reaches corners the build did not see:
   * a frame reads the baked pairs of such a corner through this map. The first light that moves builds it, so a level
   * without a light drag never pays for it.
   */
  segmentOf: Int32Array
  /**
   * The cursors of the merge of the frame, one per light of the layer.
   */
  cursors: Int32Array
  /**
   * The base color of a corner the build did not light, three channels.
   */
  readonly scratch: Float32Array
  /**
   * The box of the corners the lights of the layer reach, in the frame of the scene.
   *
   * @remarks
   * A light may move out of the box of the build, and the cull of a frame reads this one too: a light that walked into
   * a room the build never lit would otherwise be culled away while the pointer holds it.
   */
  readonly bounds: Sphere
}

/**
 * The baked color of the corners of a level, from the palette or from the flat profile.
 */
export type BaseLight = {
  readonly flat: number | undefined
  readonly palette: readonly ArxColor[]
}

/**
 * What the corners of the solid geometry are to the layer: which one may take light, and which palette entry it reads.
 */
export type VertexLighting = {
  readonly lightMask: Uint8Array
  readonly vertexPalette: Int32Array
}

/**
 * The light of every corner-light pair, before the pairs are grouped by corner.
 */
export type LightPairs = {
  readonly lightOf: number[]
  readonly vertexOf: number[]
  readonly weightOf: number[]
}

/**
 * What the pair builder reads: the lights that burn, the corners of the solid geometry and the mask of the corners that
 * may take light.
 */
export type LightPairSource = {
  readonly lights: readonly ArxLight[]
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly lightMask: Uint8Array
  readonly vertexCount: number
}

/**
 * The pairs of the layer, grouped by the corner of the geometry.
 */
export type PairTable = {
  readonly vertices: Int32Array
  readonly starts: Int32Array
  readonly pairLights: Int32Array
  readonly pairWeights: Float32Array
}

/**
 * The inputs of the weights of one light, as the model read them at its build.
 *
 * @remarks
 * The lights of the model are the **live** objects of the level (their colors follow the editor without a build), so a
 * light that moved can not be told from its own object: the model keeps what the weights were built from, and a light
 * that reads another place, reach, intensity or flag is a build of its own (2026-11-23, the owner: the flicker of a
 * moved torch stayed at the place it started from).
 */
export type LightWeightSnapshot = {
  readonly fallEnd: number
  readonly fallStart: number
  readonly flags: number
  readonly intensity: number
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
}

/**
 * The dynamic light layer of a level: which corner takes how much light from which semi-dynamic light.
 *
 * @remarks
 * The geometry of the level is fixed while the flicker runs, so the work of the layer is split: this model holds what
 * can be computed once (the weight of every light on every corner it reaches) and a frame only multiplies those weights
 * with the flicker color of the lights. The model is built again when the geometry, the lights or the palette change;
 * the weights are stored per corner of the **drawn** geometry, so the color attribute can be written without walking
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
   * were built from, and a color that changed only swaps the entries (see {@link refreshDynamicLightLights}).
   */
  readonly lights: ArxLight[]
  /**
   * The weights every light was built with, in the order of {@link lights}.
   */
  readonly weightSnapshot: readonly LightWeightSnapshot[]
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
   * The palette entry of every affected vertex, or `-1` when the corner takes no palette color (a white one).
   */
  readonly paletteIndexes: Int32Array
  /**
   * The baked color of every affected vertex in sRGB, from 0 to 255, three channels each.
   *
   * @remarks
   * The palette of the level is the light the game's own editor baked, and the layer adds its light to it. The flat
   * profile writes one gray on every corner, and the model follows it: the flat value is not a palette entry.
   */
  readonly baseColors: Float32Array
  /**
   * The color of the lights of the current frame, three channels each, reused by every update.
   */
  readonly lightColors: Float32Array
  /**
   * The box of the corners the layer lights, in the frame of the scene.
   *
   * @remarks
   * The layer writes the color of these corners on every frame of the flicker, and the frame is worth it only when a
   * view can see one of them: a walkable view that looks at a room with no burning light has nothing to draw, and the
   * cull of the frame tests this sphere against its frustum (2026-11-18, the owner).
   */
  readonly bounds: Sphere
  /**
   * Which corner of the geometry may take the light of the layer at all: a blended face, the water and a glow take
   * none, and the layer leaves their corners alone.
   */
  readonly lightMask: Uint8Array
  /**
   * The palette entry of every corner of the geometry, or `-1` for a white one.
   *
   * @remarks
   * The base colors of the build cover the corners the build lights; a corner a moved light reaches for the first time
   * reads its palette entry here (2026-11-24, the owner: a dragged light lights its new place while the pointer holds
   * it).
   */
  readonly vertexPalette: Int32Array
  /**
   * The palette or the flat light the base colors are read from.
   */
  lightBase: BaseLight
  /**
   * The pairs of the lights that moved after the build, or `undefined` while no light moved.
   */
  live?: LiveLayer
}
