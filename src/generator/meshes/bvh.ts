import type { Mesh } from 'three'
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh'
/**
 * How many triangles a leaf of the tree holds.
 *
 * @remarks
 * Measured on level 11 (123 617 triangles, `experiments/browser-editor-delete-cost/`): the tree is what a delete
 * pays for (a cut geometry keeps its triangle order, so the tree is built again), and the default of ten gives
 * **31,5 ms** to build and **5,96 ms** for 200 rays, while forty gives **22,9 ms** and **1,35 ms** — cheaper to
 * build *and* faster to walk. Eighty builds a little faster still (20,5 ms) but walks slower (1,91 ms).
 */
const MAX_LEAF_SIZE = 40

/**
 * How the tree of the picking is built.
 */
export type RaycastOptions = {
  /**
   * Whether the tree leaves the index of the geometry to its caller.
   *
   * @remarks
   * A plain tree **writes the index**: it groups the triangles for its own walk, so a geometry whose index is sorted
   * for the renderer (the level sorts it, one run per texture: see `ArxMap`) would lose that order on the next build,
   * and the draw would fall back to tens of thousands of groups. The indirect tree keeps the triangle ids in a buffer
   * of its own and never touches the index — the renderer's order and the tree's walk can differ.
   */
  readonly indirect?: boolean
}

/**
 * Makes the raycast of a mesh go through a BVH instead of every triangle.
 *
 * @remarks
 * The level is one mesh with tens of thousands of triangles, and every pick (the click of a fixed view) and
 * every lighting ray would test all of them. `three-mesh-bvh` builds the tree once, and
 * {@link acceleratedRaycast} walks that. The tree is built **here**, where the mesh is made, so every
 * consumer gets it without knowing about it: the fixed view picks, and the vertex lighting of the next
 * round rays.
 *
 * The raycast of the mesh is replaced and not the prototype: patching `Mesh.prototype` would touch every
 * three object of the page, and the generator is a library the level projects use as well.
 *
 * @param mesh The mesh to speed up; its geometry has to be built already.
 * @param options How the tree is built; a plain tree by default.
 */
export function accelerateRaycast(mesh: Mesh, options: RaycastOptions = {}): void {
  mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, {
    maxLeafSize: MAX_LEAF_SIZE,
    indirect: options.indirect === true,
  })
  mesh.raycast = acceleratedRaycast
}
