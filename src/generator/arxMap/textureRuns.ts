import type { ArxPolygon } from 'arx-convert/types'
import { BufferAttribute, type BufferGeometry } from 'three'
import { blendModeOf, blendTransOf, isDoubleSided, POLYGON_BLEND_MODES, type PolygonBlendMode } from '../polygons.ts'

/**
 * A run of solid faces that share a texture, in the order the geometry draws them.
 *
 * @remarks
 * The run is what a **group** of the geometry is: the renderer draws every group with one material, so a run is one
 * draw call. `ArxMap.textureRuns` holds them, and the paint builds the groups from this list instead of walking
 * the triangles of the index.
 */
export interface TextureRun {
  /**
   * The first index of the run in the index of the solid mesh.
   */
  readonly start: number
  /**
   * How many indices the run holds.
   */
  readonly count: number
  /**
   * The texture container the faces of the run draw with.
   */
  readonly textureContainerId: number
  /**
   * Whether the faces of the run are drawn from both sides.
   *
   * @remarks
   * The side is part of the material a run draws with, so a texture that has a two-sided face and a one-sided one needs
   * **two runs**: the paint builds a material of each kind (`levelTextures`), and the run is the block of one of them.
   */
  readonly doubleSided: boolean
  /**
   * How the game blends the faces of the run.
   *
   * @remarks
   * The blend mode is a property of the **material** too: a texture that is used by an opaque wall and by a lamp's glow
   * needs a material of each kind. A light ray adds to what is behind it, a torch's flame subtracts from it — one
   * opaque material can not do either.
   */
  readonly blend: PolygonBlendMode
  /**
   * The brightness the game multiplies the texture of the run with.
   *
   * @remarks
   * It is a number of the faces of the level (`transval`), and a light ray that is dimmer is the same texture with a
   * lower value: the material of the run carries it as its colour, so a run of one blend mode can hold the faces of
   * one brightness.
   */
  readonly trans: number
}

/**
 * The number of brightness steps a run key gives a face: the hundredth of its `trans` value.
 *
 * @remarks
 * The key of a run is a number the triangles are sorted with, so every part of it is a digit of the same number: the
 * brightness is the last one, which is why a light ray of a dimmer value is a run of its own.
 */
const BLEND_TRANS_STEP = 256

/**
 * How many container ids one blend mode and side of the key can hold.
 *
 * @remarks
 * The **blend mode comes first** in the key: the renderer draws the groups of a geometry in the order of the index, so
 * the opaque faces have to come before the blended ones — a blended face that is drawn first is painted over by the
 * wall behind it (it writes no depth, the wall does).
 *
 * The ids of the data are below 70 million, so the 134 million of this span hold them; a container id above it would
 * fall into the next side or blend mode of the key.
 */
const CONTAINER_KEY_SPAN = 2 ** 27

/**
 * The distance of the two sides of a face in a run key.
 */
const BLEND_SIDE_STEP = CONTAINER_KEY_SPAN * BLEND_TRANS_STEP

/**
 * The distance of two blend modes in a run key.
 */
const BLEND_MODE_STEP = BLEND_SIDE_STEP * 2

/**
 * The key of a run: its container, its side, its blend mode and its brightness, in one number.
 *
 * @remarks
 * A container id is far from the `Number.MAX_SAFE_INTEGER` (the game's are below 70 million) and the key is a
 * `Float64Array` of integers, so the number stays exact: the sort of the triangles is still a subtraction.
 *
 * @param container The id of the texture container.
 * @param doubleSided Whether the faces draw on both sides.
 * @param blendIndex The place of the blend mode in {@link POLYGON_BLEND_MODES}.
 * @param trans The brightness of the faces.
 *
 * @returns The key the triangles of the run sort with.
 */
function runKeyOf(container: number, doubleSided: boolean, blendIndex: number, trans: number): number {
  const transStep = Math.min(BLEND_TRANS_STEP - 1, Math.max(0, Math.round(trans * 100)))
  let side = 0

  if (doubleSided) {
    side = 1
  }

  const modeOffset = blendIndex * 2
  const sideOffset = modeOffset + side
  const containerOffset = sideOffset * CONTAINER_KEY_SPAN
  const key = containerOffset + container
  const transPart = key * BLEND_TRANS_STEP

  return transPart + transStep
}

/**
 * The container of a run key.
 *
 * @param key The key of a run, as a triangle of it carries it.
 *
 * @returns The id of the texture container the faces of the run draw with.
 */
function containerOfRunKey(key: number): number {
  return Math.trunc(key / BLEND_TRANS_STEP) % CONTAINER_KEY_SPAN
}

/**
 * The blend mode of a run key.
 *
 * @param key The key of a run, as a triangle of it carries it.
 *
 * @returns How the game blends the faces of the run.
 */
function blendOfRunKey(key: number): PolygonBlendMode {
  const index = Math.trunc(key / BLEND_MODE_STEP)

  return POLYGON_BLEND_MODES[index] ?? 'opaque'
}

/**
 * Reads the run key of a polygon.
 *
 * @remarks
 * Every part of the key is a property of the face, so the key of a run is read from its first polygon the same way the
 * sort of the triangles reads it ({@link indexSolidGeometryInTextureOrder}) and a later texture edit reads it again
 * ({@link readTextureRuns}). The brightness of a face without one is the opaque value, so a polygon the level has no
 * place for still gets a key of its own.
 *
 * @param polygon The polygon to read, or `undefined` when the triangle has none.
 *
 * @returns The key the triangles of the face sort with.
 */
function runKeyOfPolygon(polygon: ArxPolygon | undefined): number {
  let container = 0
  let blendIndex = 0
  let trans = 1

  if (polygon !== undefined) {
    container = polygon.textureContainerId
    blendIndex = POLYGON_BLEND_MODES.indexOf(blendModeOf(polygon))
    trans = blendTransOf(polygon)
  }

  return runKeyOf(container, polygon !== undefined && isDoubleSided(polygon), blendIndex, trans)
}

/**
 * Builds the run of a key, the way the level stores it.
 *
 * @param key The key the triangles of the run carry.
 * @param start The first index of it in the index buffer.
 * @param count The number of the indices of the buffer the run holds.
 *
 * @returns The run, in the shape {@link TextureRun} has.
 */
function textureRunOf(key: number, start: number, count: number): TextureRun {
  return {
    start,
    count,
    textureContainerId: containerOfRunKey(key),
    doubleSided: Math.trunc(key / BLEND_SIDE_STEP) % 2 === 1,
    blend: blendOfRunKey(key),
    trans: (key % BLEND_TRANS_STEP) / 100,
  }
}

/**
 * Reads the runs of the texture of a geometry, in the order it draws them.
 *
 * @remarks
 * The runs are the blocks of the index the paint draws with one material each, so they are read in the order the
 * geometry **draws** them (the BVH of the picking wrote that index): a run is a stretch of the index whose faces share
 * a key, and a key is the container, the side, the blend mode and the brightness of the face
 * ({@link runKeyOfPolygon}). Neighbouring runs of one key are merged, so a texture that came back to a face next to
 * another face of its own is one run again.
 *
 * A geometry with no index has no draw order to follow: there are no runs, and the paint walks the polygons itself
 * (`faceRunsOf`).
 *
 * @param geometry The geometry of the solid mesh.
 * @param polygons The polygons of the level, in the order of their triangles.
 * @param triangleToPolygon The polygon of every triangle of the geometry.
 *
 * @returns The runs, in the order of the index, or an empty list without an index.
 */
export function readTextureRuns(
  geometry: BufferGeometry,
  polygons: readonly ArxPolygon[],
  triangleToPolygon: readonly number[],
): TextureRun[] {
  const index = geometry.getIndex()

  if (index === null) {
    return []
  }

  const runs: TextureRun[] = []
  let runKey = -1
  let runStart = 0
  let runCount = 0

  for (let position = 0; position < index.count; position = position + 3) {
    // the first vertex of the triangle is its place in the plain order (three vertices per triangle), which is the
    // polygon of the triangle through the map of the BVH index (`triangleToPolygon`)
    const plain = index.getX(position) / 3
    const key = runKeyOfPolygon(polygons[triangleToPolygon[plain] ?? -1])

    if (key === runKey) {
      runCount = runCount + 3

      continue
    }

    if (runCount > 0) {
      runs.push(textureRunOf(runKey, runStart, runCount))
    }

    runKey = key
    runStart = position
    runCount = 3
  }

  if (runCount > 0) {
    runs.push(textureRunOf(runKey, runStart, runCount))
  }

  return runs
}

/**
 * Builds the index of the solid mesh in the order of the texture containers.
 *
 * @remarks
 * The renderer draws one group per run of faces that share a **material**, and a group is a range of the **index**: a
 * run is the faces of one texture container that draw on the same side (the two-sided faces of a fence or a door get
 * a material of their own, see `levelTextures`), and an index in the polygon order gives tens of thousands of runs on
 * a big level (level 11: 30 349), one in this order gives one per container and side (266 + the two-sided ones).
 *
 * The order is written as an index and **not by moving the vertices**, so the picking keeps reading `face.a` the way
 * it does: the vertex of the first corner divided by three is the triangle of the polygon list (see
 * `polygonSelection.polygonOfHit`). The tree is built with `indirect: true` (`accelerateRaycast`), so it does not
 * write the index back into its own order.
 *
 * A stable sort keeps the order of the polygons inside one run, which is the order the level reads best.
 *
 * @param geometry The geometry of the solid mesh; the new index goes on it.
 * @param polygons The polygons of the level, in the order of their triangles.
 * @param triangleToPolygon The polygon of every triangle of the geometry.
 *
 * @returns The runs the new index holds, in the order the geometry draws them.
 */
export function indexSolidGeometryInTextureOrder(
  geometry: BufferGeometry,
  polygons: readonly ArxPolygon[],
  triangleToPolygon: readonly number[],
): TextureRun[] {
  const triangles = geometry.getAttribute('position').count / 3

  // the run of a triangle is its container, its side, its blend mode and its brightness, in one number:
  // `((container * 2 + side) * 5 + blend) * 256 + trans`, with the brightness in hundredths
  const runKeyOfTriangle = new Float64Array(triangles)
  let sorted = true

  for (let triangle = 0; triangle < triangles; triangle = triangle + 1) {
    runKeyOfTriangle[triangle] = runKeyOfPolygon(polygons[triangleToPolygon[triangle] ?? -1])

    // a cut keeps the order of the polygons, so the level that was in this order stays in it: the check is one walk,
    // the sort is a comparison per triangle (level 11: 40 ms against 2 ms)
    if (triangle > 0 && runKeyOfTriangle[triangle] < runKeyOfTriangle[triangle - 1]) {
      sorted = false
    }
  }

  let order: readonly number[] | undefined

  if (!sorted) {
    order = Array.from({ length: triangles }, (_, triangle) => {
      return triangle
    }).toSorted((left, right) => {
      return runKeyOfTriangle[left] - runKeyOfTriangle[right]
    })
  }

  const indices = new Uint32Array(triangles * 3)
  const runs: TextureRun[] = []
  let runKey = -1
  let runStart = 0
  let runCount = 0
  function pushRun(start: number, count: number, key: number): void {
    runs.push(textureRunOf(key, start, count))
  }

  for (let position = 0; position < triangles; position = position + 1) {
    let triangle = position

    if (order !== undefined) {
      triangle = order[position] ?? position
    }

    const key = runKeyOfTriangle[triangle]
    const target = position * 3
    const source = triangle * 3

    indices[target] = source
    indices[target + 1] = source + 1
    indices[target + 2] = source + 2

    if (key === runKey) {
      runCount = runCount + 3
    } else {
      if (runCount > 0) {
        pushRun(runStart, runCount, runKey)
      }

      runKey = key
      runStart = target
      runCount = 3
    }
  }

  if (runCount > 0) {
    pushRun(runStart, runCount, runKey)
  }

  geometry.setIndex(new BufferAttribute(indices, 1))

  return runs
}
