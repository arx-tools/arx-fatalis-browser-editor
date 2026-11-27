import { Vector3, type Camera } from 'three'

/**
 * How far from the middle of the view a place of the gizmo may stand, in the units of the clip space.
 *
 * @remarks
 * The gizmo is drawn over the selection, and its arrows reach a little farther than the middle of it: a place that
 * projects this close to the edge of the view is the last one whose handles are still inside the canvas. The margin stays
 * in the middle of the view on both axes: a handle pulled to the very edge of the canvas sits in a corner of it, which the
 * author has to look away from the mesh to find (2026-11-27, the owner).
 */
const VIEW_MARGIN = 0.55

/**
 * Reads where the gizmo stands: on the selection, and as close to the middle of the view as its place allows.
 *
 * @remarks
 * The gizmo sits on the middle of the selection, and a big mesh (or a camera turned away from the middle) puts that
 * middle behind the camera or past the edge of the canvas: the author has to zoom out to reach the arrows, and loses the
 * precision the zoom gave. So the handle keeps the place of the selection while that place is on the view, and when it is
 * not, the place is **pulled toward the middle** of the view, as far as the canvas allows (the margin keeps the arrows
 * inside it). The handle stays over the mesh, where the author looks at it.
 *
 * The drag reads the same world units wherever the handle stands (a move of the handle along an axis is one length,
 * whatever the place of it is), so a selection moves the same way from a placed handle.
 *
 * @param camera The camera the view draws through.
 * @param pivot The middle of the selection, in the world.
 *
 * @returns Where the gizmo stands: the pivot itself when it is on the view, or the nearest place to the middle.
 */
export function gizmoPlaceOf(camera: Camera, pivot: Vector3): Vector3 {
  const projected = pivot.clone().project(camera)
  const onView = Math.abs(projected.x) <= VIEW_MARGIN && Math.abs(projected.y) <= VIEW_MARGIN && projected.z <= 1

  if (onView) {
    return pivot.clone()
  }

  // the nearest place to the middle of the view (a pivot behind the camera goes to the far plane, where the handle still
  // stands in front of the level: the gizmo draws over it)
  const pulled = new Vector3(
    Math.max(-VIEW_MARGIN, Math.min(VIEW_MARGIN, projected.x)),
    Math.max(-VIEW_MARGIN, Math.min(VIEW_MARGIN, projected.y)),
    Math.min(projected.z, 0.9999),
  )

  return pulled.unproject(camera)
}

/**
 * The box of the selection in the world, the sides of it.
 */
export type GizmoBounds = {
  /**
   * The lowest X of the corners.
   */
  readonly minX: number
  /**
   * The highest X of the corners.
   */
  readonly maxX: number
  /**
   * The lowest Y of the corners.
   */
  readonly minY: number
  /**
   * The highest Y of the corners.
   */
  readonly maxY: number
  /**
   * The lowest Z of the corners.
   */
  readonly minZ: number
  /**
   * The highest Z of the corners.
   */
  readonly maxZ: number
}

/**
 * Tells whether any corner of a box of the selection is on the view.
 *
 * @remarks
 * A selection that left the view takes its middle with it, and the handle of it would stand pulled into the canvas with
 * nothing under it: the gizmo is hidden then, and it comes back with the mesh (2026-11-27, the owner).
 *
 * @param camera The camera the view draws through.
 * @param bounds The box of the selection in the world, when it has one.
 *
 * @returns True when a corner of the box projects into the view.
 */
export function isSelectionOnView(camera: Camera, bounds: GizmoBounds): boolean {
  const corner = new Vector3()

  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) {
      for (const z of [bounds.minZ, bounds.maxZ]) {
        const projected = corner.set(x, y, z).project(camera)

        if (Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z <= 1) {
          return true
        }
      }
    }
  }

  return false
}
