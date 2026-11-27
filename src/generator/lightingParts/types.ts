import type { ArxLight } from 'arx-convert/types'
import type { Matrix4, Mesh, Ray, Vector3 } from 'three'
import type { MeshBVH } from 'three-mesh-bvh'
import type { LightingCalculatorMode } from '../types.ts'

/**
 * How the palette of the level is baked from its lights.
 */
export type LightingOptions = {
  /**
   * The profile of the bake.
   *
   * @remarks
   * `Arx` is the game-like look (the static lights only, a factor of 0.85 and an ambient floor of 23), `Realistic`
   * follows the Fred profile (the static lights, a factor of 1, its own ambient floor and an occlusion test when
   * shadows are on). The semidynamic lights, the torches among them, stay out of both: the game lights them up at
   * runtime. The other modes are for checking the level.
   */
  readonly mode: LightingCalculatorMode
  /**
   * The light of the `Flat` profile, from 0 (dark) to 1 (the brightest), in steps of 0.1 on the widget.
   *
   * @remarks
   * The flat light is one gray for every corner: the slider of the widget sets it, and 0 and 1 are the old darkness and
   * maximum brightness.
   */
  readonly flatLuminosity?: number
  /**
   * The value of the colors of the `TextureRainbow` profile, from 0 (black) to 1 (the full color of the hue).
   *
   * @remarks
   * The profile draws a hue per texture container, and this is the value of every one of them: the slider of the widget
   * sets it, so a darker level keeps the colors of the containers, just darker.
   *
   * @default 1
   */
  readonly rainbowLuminosity?: number
  /**
   * The meshes that block the light of a vertex, for the `Realistic` profile.
   *
   * @remarks
   * Without them a light reaches every vertex the angle lets it: the `Arx` look, which is what the game's own palette
   * was made of. The level's solid mesh is the one the editor passes.
   */
  readonly occluders?: readonly Mesh[]
  /**
   * The lowest value of a baked color, from 0 to 255.
   *
   * @remarks
   * The `Realistic` profile has no floor by default, so a shadowed vertex goes to black; the game's own palette never
   * goes below 23. The `Arx` profile uses 23 whatever this says.
   *
   * @default 0
   */
  readonly ambientFloor?: number
  /**
   * Whether the `Realistic` profile tests the way of the light against the occluders.
   *
   * @default true
   */
  readonly shadows?: boolean
}

/**
 * The cells of the lights of a level.
 */
export type LightGrid = {
  /**
   * The lights of the cells, by the hash of the coordinates of a cell.
   *
   * @remarks
   * The lights are in the order of the level, and a cell merged with the list of the whole level keeps that order: a
   * corner sums the same lights in the same order wherever it reads them from, so the bake of the whole level and the
   * bake of the corners of an edit give the same palette.
   */
  readonly cells: ReadonlyMap<number, readonly number[]>
  /**
   * The lights that reach too far to be put in cells, in the order of the level.
   */
  readonly everywhere: readonly number[]
}

/**
 * The grid of a level, and the lights it was built from.
 */
export type LightGridCache = {
  /**
   * The grid itself.
   */
  readonly grid: LightGrid
  /**
   * The lights of the bake at the build, of which the grid holds the places and the reaches.
   */
  readonly lights: readonly ArxLight[]
}

/**
 * What the bake of one corner reads.
 *
 * @remarks
 * The two vectors are the corner, and a walk writes them for every corner it bakes: the bake of a level builds one of
 * these and moves it from corner to corner, so the loop does not allocate a new context for each of the hundred thousand
 * corners of a big level.
 */
/**
 * A mesh of the level the bake tests the light against.
 *
 * @remarks
 * The tree of the triangles answers a ray in the space of the **mesh**, so the bake keeps the mesh turned around, and
 * every ray of a corner goes through it before the tree reads it. The tree is asked directly, and not through the
 * `Raycaster` of three, which builds an intersection object on every call: a level of the game asks hundreds of
 * thousands of times (2026-11-27, the owner: the realistic bake of level 1 took forty seconds).
 */
export type Blocker = {
  /**
   * The tree of the triangles of the mesh.
   */
  readonly tree: MeshBVH
  /**
   * The matrix that takes a point of the world into the space of the mesh.
   */
  readonly inverse: Matrix4
}

export type CornerBake = {
  /**
   * The position of the corner in the frame of the scene.
   */
  readonly position: Vector3
  /**
   * The normal of the corner in the frame of the scene.
   */
  readonly normal: Vector3
  /**
   * The lights the profile bakes, with their position in the frame of the scene.
   */
  readonly lights: ReadonlyArray<{ readonly light: ArxLight; readonly position: Vector3 }>
  /**
   * The meshes that block the light, for the realistic profile, with the way into their own space.
   */
  readonly blockers: readonly Blocker[]
  /**
   * The ray of the bake, in the space of the world: the tests of the corners reuse it.
   */
  readonly ray: Ray
  /**
   * The factor of the profile on the intensity of a light.
   */
  readonly factor: number
  /**
   * The lowest value of the baked color.
   */
  readonly ambient: number
  /**
   * The vector the bake reuses for the direction of the light.
   */
  readonly toLight: Vector3
  /**
   * The lights to read for the corner, by their index in {@link CornerBake.lights}, ascending.
   *
   * @remarks
   * The grid of the lights writes the list for every corner, and the bake of the whole level keeps the whole list: the
   * two are the same order, so the sum of the corner is the same. The array is reused from corner to corner, and only
   * {@link CornerBake.candidateCount} of its entries are the lights of the corner.
   */
  readonly candidates: number[]
  /**
   * How many entries of {@link CornerBake.candidates} are the lights of the corner.
   */
  candidateCount: number
}

/**
 * The scene of the level, and the corner a walk of the bake moves.
 */
export type BakeContext = {
  /**
   * The corner every step of the walk writes before it bakes it.
   */
  readonly corner: CornerBake
  /**
   * The grid of the lights, when the walk fills the lights of a corner from it.
   */
  readonly grid: LightGrid | undefined
}

/**
 * The corners of a level the partial bake reads, one entry per corner of its geometry.
 */
export type CornerSpots = {
  /**
   * The position of every corner, three channels each, in the frame of the scene.
   */
  readonly positions: Float32Array
  /**
   * The normal of every corner, three channels each, in the frame of the scene.
   */
  readonly normals: Float32Array
  /**
   * Whether the face of the corner is drawn from both sides, so its normal turned away still takes the light.
   */
  readonly doubleSided: Uint8Array
  /**
   * The palette entry of every corner, or `-1` when the corner takes no color from the palette.
   */
  readonly paletteIndexes: Int32Array
}
