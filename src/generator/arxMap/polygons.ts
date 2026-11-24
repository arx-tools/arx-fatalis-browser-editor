import type { ArxPolygon, ArxVector3 } from 'arx-convert/types'
import { isQuad } from 'arx-convert/utils'
import { wireframeLineColorOf } from '../flatColors.ts'
import { arxPolygonsToGeometry, arxPolygonsToWireframeGeometry, arxVector3toVector3 } from '../meshes.ts'
import type { ArxMap } from '../ArxMap.ts'
import { type GeometrySlice, type PolygonInsertion, pushSlice, slicesOf } from './removal.ts'
import { type PolygonTurn, rotatePolygonsOf, scalePolygonsOf, translatePolygonsOf } from './transforms.ts'

/**
 * What a change of the polygon list does to the rest of the level: the slices of the two geometries and the change of
 * the figures.
 */
export type PolygonChange = {
  /**
   * The slices of the solid geometry, or `undefined` when the change does not touch it.
   */
  readonly solid?: readonly GeometrySlice[]
  /**
   * The slices of the wireframe.
   */
  readonly wireframe: readonly GeometrySlice[]
  /**
   * How many faces the change adds (a negative number takes them away).
   */
  readonly faces: number
  /**
   * How many of them are quads.
   */
  readonly quads: number
  /**
   * How many of them are triangles.
   */
  readonly triangles: number
}

/**
 * The polygons of a level, with the operations that change them.
 *
 * @remarks
 * The list is an array of the polygons of the file, in the order the mesh draws them, and the operations that take
 * faces out, put them back or move them live here: a caller writes `map.polygons.remove(faces)`, and the geometry, the
 * statistics and the index of the welded vertices follow through the map the list belongs to.
 *
 * The class is an `Array`: every reader of the level walks it as a list (`for`, `filter`, `map`, `length`), and only the
 * changes go through the methods. A `filter` or a `slice` of it is a **plain array** (`Symbol.species`), because a copy
 * of the list has no map to change.
 */
export class Polygons extends Array<ArxPolygon> {
  /**
   * The map the polygons belong to: the geometry and the statistics of the level follow a change of the list.
   */
  private readonly owner: ArxMap

  /**
   * Builds the list of a level.
   *
   * @param owner The map the list belongs to.
   */
  constructor(owner: ArxMap) {
    super()
    this.owner = owner
  }

  /**
   * A copy of the list is a plain array: a slice keeps no map to change.
   *
   * @returns The array type every copy of the list is.
   */
  static get [Symbol.species](): ArrayConstructor {
    return Array
  }

  /**
   * Takes polygons out of the level, by identity.
   *
   * @remarks
   * The polygons leave for good, and every derived field follows: the polygon list, the triangle map, the wireframe,
   * the geometry of the two meshes and the statistics.
   *
   * **The geometry is cut, not rebuilt.** The vertices of the removed polygons are copied out of the buffers of the
   * meshes (`keptRuns` + `copyVertexSegments`), which is a memcpy of the kept slices: a rebuild would walk every
   * polygon, transform its vertices and build new typed arrays, and on the big level (69 817 polygons, 364 899
   * triangle indices) that is about 260 ms against a few milliseconds for the cut (measured:
   * `experiments/browser-editor-delete-cost/`). The **mesh objects stay the same**: a view puts its meshes into its
   * scene once, so the geometry under it is refilled in place.
   *
   * What the cut does not save is the BVH: it groups the triangles, so a shorter triangle list needs a new tree
   * (`accelerateRaycast` on the meshes that lost a polygon). That is the remaining cost of a delete. The vertex index
   * ({@link ArxMap.vertexToPolygons}) is dropped rather than rebuilt, so the first drag or double click after an edit
   * builds it again.
   *
   * @param polygons The polygons to take out, as they are in the list.
   */
  remove(polygons: readonly ArxPolygon[]): void {
    const removed = new Set(polygons)

    if (removed.size === 0) {
      return
    }

    const kept: ArxPolygon[] = []
    const solidCounts: number[] = []
    const solidKept: boolean[] = []
    const wireframeCounts: number[] = []
    const wireframeKept: boolean[] = []
    let faces = 0
    let quads = 0
    let triangles = 0

    // one walk over the polygons: how many vertices a polygon owns in the geometry (3 for a triangle, 6 for a quad)
    // and in the wireframe (two per edge of the perimeter)
    for (const polygon of this) {
      const gone = removed.has(polygon)
      const quad = isQuad(polygon)
      let vertices = 3
      let edges = 6

      if (quad) {
        vertices = 6
        edges = 8
      }

      solidCounts.push(vertices)
      solidKept.push(!gone)

      if (!gone) {
        kept.push(polygon)
      }

      wireframeCounts.push(edges)
      wireframeKept.push(!gone)

      if (gone) {
        faces = faces - 1

        if (quad) {
          quads = quads - 1
        } else {
          triangles = triangles - 1
        }
      }
    }

    if (kept.length === this.length) {
      return
    }

    this.splice(0, this.length, ...kept)

    let solid: GeometrySlice[] | undefined

    if (kept.length !== solidCounts.length) {
      solid = slicesOf(this.owner.solidMeshes[0].geometry, solidCounts, solidKept)
    }

    this.owner.applyPolygonChange({
      faces,
      quads,
      solid,
      triangles,
      wireframe: slicesOf(this.owner.wireframeGeometry, wireframeCounts, wireframeKept),
    })
  }

  /**
   * Takes polygons out of the level, by their index in the list.
   *
   * @param indices The indices of the polygons, as the list holds them.
   */
  delete(indices: Iterable<number>): void {
    const polygons: ArxPolygon[] = []

    for (const index of indices) {
      const polygon = this[index]

      if (polygon !== undefined) {
        polygons.push(polygon)
      }
    }

    this.remove(polygons)
  }

  /**
   * Puts polygons back, at the places they were taken from.
   *
   * @remarks
   * It is the inverse of {@link Polygons.remove}: the records say which polygon goes back at which index of the list,
   * so the order of the level is the one it had. The geometry is **spliced** the same way the cut works — the kept
   * vertices come from the live buffers, the restored polygons from a small geometry built for them (they are the only
   * ones rebuilt, so an undo of a few faces is cheap), and the two are interleaved in the order of the list.
   *
   * The vertices of the restored polygons keep their place divided by three, so the pick and the triangle map stay
   * right; the BVHs of the meshes that got a polygon are built again, because a longer triangle list needs a new tree.
   *
   * @param insertions The polygons and the indices they go back to.
   *
   * @throws When the records do not fit the level (an index past the end of the list): the history of one level is not
   * the history of another, so it is cleared on a load and this should not happen.
   */
  insert(insertions: readonly PolygonInsertion[]): void {
    if (insertions.length === 0) {
      return
    }

    const byIndex = new Map<number, ArxPolygon>()

    for (const insertion of insertions) {
      byIndex.set(insertion.index, insertion.polygon)
    }

    const next: ArxPolygon[] = []
    let from = 0

    for (let index = 0; index < this.length + insertions.length; index = index + 1) {
      const inserted = byIndex.get(index)

      if (inserted !== undefined) {
        next.push(inserted)

        continue
      }

      const kept = this[from]

      if (kept === undefined) {
        throw new Error('the insertion does not fit the level')
      }

      next.push(kept)
      from = from + 1
    }

    const restored = new Set(
      insertions.map((insertion) => {
        return insertion.polygon
      }),
    )
    const offset = arxVector3toVector3(this.owner.fts.header.mScenePosition)
    const restoredSolid = next.filter((polygon) => {
      return restored.has(polygon)
    })
    const solidBuilt = arxPolygonsToGeometry(restoredSolid, offset)
    const wireframeBuilt = arxPolygonsToWireframeGeometry(restoredSolid, offset, (polygon) => {
      return wireframeLineColorOf(this.owner.textureNameOf(polygon.textureContainerId))
    })

    const solidSlices: GeometrySlice[] = []
    const wireframeSlices: GeometrySlice[] = []
    let solidLive = 0
    let wireframeLive = 0
    let solidRestored = 0
    let wireframeRestored = 0
    let faces = 0
    let quads = 0
    let triangles = 0

    for (const polygon of next) {
      const quad = isQuad(polygon)
      let vertices = 3
      let edges = 6

      if (quad) {
        vertices = 6
        edges = 8
      }

      if (restored.has(polygon)) {
        pushSlice(solidSlices, solidBuilt, solidRestored, vertices)
        solidRestored = solidRestored + vertices
      } else {
        pushSlice(solidSlices, this.owner.solidMeshes[0].geometry, solidLive, vertices)
        solidLive = solidLive + vertices
      }

      if (restored.has(polygon)) {
        pushSlice(wireframeSlices, wireframeBuilt, wireframeRestored, edges)
        wireframeRestored = wireframeRestored + edges
        faces = faces + 1

        if (quad) {
          quads = quads + 1
        } else {
          triangles = triangles + 1
        }
      } else {
        pushSlice(wireframeSlices, this.owner.wireframeGeometry, wireframeLive, edges)
        wireframeLive = wireframeLive + edges
      }
    }

    this.splice(0, this.length, ...next)

    let solid: GeometrySlice[] | undefined

    if (restoredSolid.length > 0) {
      solid = solidSlices
    }

    this.owner.applyPolygonChange({
      faces,
      quads,
      solid,
      triangles,
      wireframe: wireframeSlices,
    })
  }

  /**
   * Moves the corners of faces.
   *
   * @param faces The faces to move, by their index in the list.
   * @param delta The offset, in the coordinates of the level.
   */
  translate(faces: readonly number[], delta: ArxVector3): void {
    if (translatePolygonsOf(this.owner, faces, delta)) {
      this.owner.invalidateVertexIndex()
    }
  }

  /**
   * Turns the corners of faces around a point.
   *
   * @param faces The faces to turn, by their index in the list.
   * @param turn The pivot, the axis and the angle of the turn.
   */
  rotate(faces: readonly number[], turn: PolygonTurn): void {
    if (rotatePolygonsOf(this.owner, faces, turn)) {
      this.owner.invalidateVertexIndex()
    }
  }

  /**
   * Scales the corners of faces from a point.
   *
   * @param faces The faces to scale, by their index in the list.
   * @param pivot The point they scale from, in the coordinates of the level.
   * @param scale The factors of the three axes.
   */
  scale(faces: readonly number[], pivot: ArxVector3, scale: ArxVector3): void {
    if (scalePolygonsOf(this.owner, faces, pivot, scale)) {
      this.owner.invalidateVertexIndex()
    }
  }
}
