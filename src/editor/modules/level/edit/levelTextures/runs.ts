import { isQuad } from 'arx-convert/utils'
import type { ArxPolygon } from 'arx-convert/types'
import type { BufferAttribute, BufferGeometry } from 'three'
import type { ArxMap } from '../../../../../generator/ArxMap.ts'
import type { TextureRun } from '../../../../../generator/arxMap/textureRuns.ts'
import { paintKeyOf, paintKeyOfPolygon, type PaintKey } from './paint.ts'

/**
 * The runs of the faces of a level that draw with the same material.
 *
 * @remarks
 * The geometry of a level is one buffer in the order of the polygons, but the renderer draws a **group** of it with one
 * material: a run is a block of neighbouring faces that share a paint key (the texture, the side, the blend mode and the
 * brightness, see [`paint.ts`](paint.ts)), and a run is one draw call. The paint builds the groups from these runs, and
 * the map keeps them (`ArxMap.textureRuns`) so the paint does not walk all the triangles of the index again (level 11:
 * 123 485 triangles, 52 ms).
 *
 * The runs are read in the order the geometry **draws** them: the picking builds a BVH on the mesh and its tree writes
 * an index, which permutes the triangles. A group of the geometry is a range of that index, so a run has to follow it,
 * not the order of the polygons.
 */

/**
 * One run of the faces of the level that draw with the same material.
 */
export interface FaceRun {
  /**
   * The first vertex of the run in the geometry.
   */
  readonly start: number
  /**
   * How many vertices the run holds: three for a triangle, six for a quad.
   */
  readonly count: number
  /**
   * What the run draws with.
   */
  readonly key: PaintKey
}

/**
 * The materials the faces of a level need, in the order they first appear.
 *
 * @param map The map of the level.
 * @param polygons The solid faces, in the order of the geometry.
 *
 * @returns The keys of the faces, without a repeat.
 */
export function neededKeysOf(map: ArxMap, polygons: readonly ArxPolygon[]): PaintKey[] {
  const keys: PaintKey[] = []
  const seen = new Set<string>()

  for (const polygon of polygons) {
    const key = paintKeyOfPolygon(map, polygon)
    const string = paintKeyOf(key)

    if (seen.has(string)) {
      continue
    }

    seen.add(string)
    keys.push(key)
  }

  return keys
}

/**
 * Reads the runs of the faces of a level that draw with the same material.
 *
 * @remarks
 * The geometry of the level is one buffer in the order of the polygons (three or six vertices each), so a material is
 * drawn with a **group** of the geometry: a run of the neighbouring faces that draw with it. The picking reads the
 * triangle order, which the groups do not touch, so it stays right.
 *
 * @param polygons The polygons of the level, in the order of the geometry.
 * @param keyOf What a polygon draws with.
 *
 * @returns The runs, in the order of the geometry.
 */
export function faceRunsOf(polygons: readonly ArxPolygon[], keyOf: (polygon: ArxPolygon) => PaintKey): FaceRun[] {
  const runs: FaceRun[] = []
  let start = 0

  for (const polygon of polygons) {
    let count = 3

    if (isQuad(polygon)) {
      count = 6
    }

    const key = keyOf(polygon)
    const last = runs.at(-1)

    if (last !== undefined && paintKeyOf(last.key) === paintKeyOf(key)) {
      runs[runs.length - 1] = { start: last.start, count: last.count + count, key }
    } else {
      runs.push({ start, count, key })
    }

    start = start + count
  }

  return runs
}

/**
 * One run of the faces of a level that share a texture, with the material it draws with.
 */
export interface DrawnRun {
  /**
   * The first index of the run in the index buffer of the geometry.
   */
  readonly start: number
  /**
   * How many indices the run holds: three per triangle.
   */
  readonly count: number
  /**
   * The material the run draws with.
   */
  readonly index: number
}

/**
 * Reads the runs of the faces of a level in the order the geometry draws them.
 *
 * @remarks
 * The mesh of the level is picked with a BVH, and the tree writes an **index** into the geometry: the triangles of the
 * index buffer are not in the order of the polygons (the tree groups them for its own walk). A group of the geometry is
 * a range of that buffer, so the runs have to be read there: every triangle of the buffer names its polygon through
 * {@link ArxMap.triangleToPolygon}, and the polygon names its texture.
 *
 * @param map The map the geometry belongs to.
 * @param index The index of the geometry.
 * @param indexOfKey The material of a paint key, from {@link paintKeyOf}.
 *
 * @returns The runs, in the order of the index buffer.
 */
export function drawnRunsOf(map: ArxMap, index: BufferAttribute, indexOfKey: ReadonlyMap<string, number>): DrawnRun[] {
  const runs: DrawnRun[] = []

  for (let triangle = 0; triangle < index.count / 3; triangle = triangle + 1) {
    // the first vertex of the triangle is the start of its polygon in the plain order: three vertices per triangle
    const plain = index.getX(triangle * 3) / 3
    const polygon = map.polygons[map.triangleToPolygon[plain] ?? -1]
    let key: PaintKey = { name: undefined, doubleSided: false, blend: 'opaque', trans: 1 }

    if (polygon !== undefined) {
      key = paintKeyOfPolygon(map, polygon)
    }

    const material = indexOfKey.get(paintKeyOf(key)) ?? 0
    const last = runs.at(-1)

    if (last?.index === material) {
      runs[runs.length - 1] = { start: last.start, count: last.count + 3, index: material }
    } else {
      runs.push({ start: triangle * 3, count: 3, index: material })
    }
  }

  return runs
}

/**
 * Tells whether the runs of the map cover the index of the geometry.
 *
 * @remarks
 * The runs are built together with the index, so they cover it; the check guards a map whose geometry was replaced
 * under it (a consumer of the generator), where walking the triangles is still right.
 *
 * @param runs The runs of the map.
 * @param index The index of the geometry.
 *
 * @returns Whether the last run ends at the last index.
 */
export function runsCoverIndex(runs: readonly TextureRun[], index: BufferAttribute): boolean {
  const last = runs.at(-1)

  return last !== undefined && last.start + last.count === index.count
}

/**
 * Adds the groups of a geometry from the runs of a level.
 *
 * @remarks
 * Two containers may share a name (`textureNames`), so the neighbouring runs of the same material are merged, the way
 * {@link drawnRunsOf} merges the neighbouring triangles: the number of the draw calls is the number of the materials.
 *
 * @param geometry The geometry of the level.
 * @param map The map of the level.
 * @param runs The runs, in the order of the index.
 * @param indexOfKey The material of a paint key, from {@link paintKeyOf}.
 */
export function addRunGroups(
  geometry: BufferGeometry,
  map: ArxMap,
  runs: readonly TextureRun[],
  indexOfKey: ReadonlyMap<string, number>,
): void {
  let start = 0
  let count = 0
  let material = -1

  for (const run of runs) {
    const key = paintKeyOf({
      name: map.textureNameOf(run.textureContainerId),
      doubleSided: run.doubleSided,
      blend: run.blend,
      trans: run.trans,
    })
    const current = indexOfKey.get(key) ?? 0

    if (current === material) {
      count = count + run.count

      continue
    }

    if (count > 0) {
      geometry.addGroup(start, count, material)
    }

    start = run.start
    count = run.count
    material = current
  }

  if (count > 0) {
    geometry.addGroup(start, count, material)
  }
}

/**
 * The polygons that draw with a real texture, in the order of the solid geometry.
 *
 * @remarks
 * The map keeps its polygons solid first and the invisible walls after them, and the solid mesh holds the first of
 * them: the count of its triangles tells where the solid part ends, so the split needs no walk of the invisible set.
 *
 * @param map The map to read.
 *
 * @returns The solid polygons, in the order of the geometry of the solid mesh.
 */
export function solidPolygonsOf(map: ArxMap): ArxPolygon[] {
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return []
  }

  const triangles = mesh.geometry.getAttribute('position').count / 3
  const polygons: ArxPolygon[] = []
  let counted = 0

  for (const polygon of map.polygons) {
    if (counted >= triangles) {
      break
    }

    polygons.push(polygon)

    if (isQuad(polygon)) {
      counted = counted + 2
    } else {
      counted = counted + 1
    }
  }

  return polygons
}

/**
 * Reads the names of the textures the level uses.
 *
 * @param map The map to read.
 *
 * @returns The distinct names of the containers of the solid faces.
 */
export function textureNamesOf(map: ArxMap): string[] {
  const names = new Set<string>()

  for (const polygon of solidPolygonsOf(map)) {
    const name = map.textureNameOf(polygon.textureContainerId)

    if (name !== undefined) {
      names.add(name)
    }
  }

  return [...names]
}
