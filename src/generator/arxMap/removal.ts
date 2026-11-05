import type { ArxPolygon } from 'arx-convert/types'
import { BufferAttribute, type BufferGeometry } from 'three'
import { copyVertexSegments, keptRuns, type VertexSegment } from '../meshes.ts'

/**
 * A polygon that goes back into the level, at the index it was taken from.
 */
export interface PolygonInsertion {
  /**
   * Where the polygon belongs in the polygon list of the level.
   */
  readonly index: number
  /**
   * The polygon itself, as it was before it was taken out.
   */
  readonly polygon: ArxPolygon
}

/**
 * A slice of a geometry: the part a new one takes over from it.
 */
export interface GeometrySlice {
  /**
   * The geometry to read.
   */
  readonly geometry: BufferGeometry
  /**
   * Where the slice starts, in vertices.
   */
  readonly from: number
  /**
   * How many vertices it holds.
   */
  readonly count: number
}

/**
 * The slices of a buffer that stay when some of its polygons go.
 *
 * @param geometry The geometry the slices are read from.
 * @param counts How many vertices every polygon owns in this geometry.
 * @param kept Which of the polygons stay.
 *
 * @returns One slice per kept run.
 */
export function slicesOf(
  geometry: BufferGeometry,
  counts: readonly number[],
  kept: readonly boolean[],
): GeometrySlice[] {
  return keptRuns(counts, kept).map((run): GeometrySlice => {
    return { geometry, from: run.from, count: run.count }
  })
}

/**
 * Adds a slice to a geometry, joining it to the previous one when the two are next to each other.
 *
 * @remarks
 * The insert walks the whole list, and the polygons that were already there come in long runs: joining them keeps
 * the number of the copies low (one per run, not one per polygon).
 *
 * @param slices The list to add to.
 * @param geometry The geometry the slice reads.
 * @param from Where the slice starts, in vertices.
 * @param count How many vertices it holds.
 */
export function pushSlice(slices: GeometrySlice[], geometry: BufferGeometry, from: number, count: number): void {
  const last = slices.at(-1)

  if (last?.geometry === geometry && last.from + last.count === from) {
    slices[slices.length - 1] = { geometry, from: last.from, count: last.count + count }

    return
  }

  slices.push({ geometry, from, count })
}

/**
 * Builds a geometry from slices of other geometries, in place.
 *
 * @remarks
 * The holders of the geometry (the mesh wrappers of the views, the line segments of the wireframe) keep the
 * object, so the attributes are replaced under them. The **index** belongs to the BVH (it groups the triangles and
 * the tree writes it), and a splice moves the triangles after the change: it is dropped here, and the new tree
 * writes a fresh one in `accelerateRaycast`.
 *
 * The **groups** go with the index: they are the runs of the texture paint, and a group is a *material range* of
 * the geometry, so `MeshBVH` builds a root per range when the tree is made (a root keeps the tree from reordering
 * triangles across two materials). A painted level has one group per run, and the runs are short (level 11: 46 480
 * of them), so a tree built on them has **46 479 roots** and every ray walks all of them — measured: the first pick
 * after a delete took 6,5 s. The paint builds the groups again after the edit (`paintLevelTextures`), and the
 * renderer needs nothing else, so they are dropped here.
 *
 * The attributes follow the **first slice**: a mesh has one layout (position, normal, uv), and the slices of the
 * same mesh are the same. A cut reads the slices from the target itself, so its attributes are read one by one, an
 * attribute that was not replaced yet still holding the old vertices.
 *
 * @param target The geometry the views hold.
 * @param slices What the new attributes are made of.
 */
export function refillGeometry(target: BufferGeometry, slices: readonly GeometrySlice[]): void {
  const [first] = slices

  // no slice means no polygon left: the geometry keeps its layout and gets empty buffers
  if (first === undefined) {
    target.clearGroups()

    for (const [name, attribute] of Object.entries(target.attributes)) {
      target.setAttribute(name, new BufferAttribute(new Float32Array(0), attribute.itemSize, attribute.normalized))
    }

    target.computeBoundingBox()
    target.computeBoundingSphere()

    return
  }

  const names = Object.keys(first.geometry.attributes)

  target.dispose()
  target.setIndex(null)
  target.clearGroups()

  for (const name of names) {
    const reference = first.geometry.getAttribute(name)
    const segments = slices.map((slice): VertexSegment => {
      return { source: slice.geometry.getAttribute(name).array as Float32Array, from: slice.from, count: slice.count }
    })

    target.setAttribute(
      name,
      new BufferAttribute(copyVertexSegments(segments, reference.itemSize), reference.itemSize, reference.normalized),
    )
  }

  target.computeBoundingBox()
  target.computeBoundingSphere()
}

/**
 * Refills a geometry the views hold from a geometry built next to it.
 *
 * @remarks
 * The first build of the level works this way (the polygons are converted once), and a cut or an undo works with
 * the slices of {@link refillGeometry}. Both keep the **object** of the geometry: a view puts it into its scene
 * once, so the vertices change under it and every holder draws the new polygons without being told.
 *
 * @param target The geometry the views hold.
 * @param source The geometry that was built for the same polygons.
 */
export function refillFromGeometry(target: BufferGeometry, source: BufferGeometry): void {
  const position = source.getAttribute('position')

  refillGeometry(target, [{ geometry: source, from: 0, count: position.count }])
  source.dispose()
}
