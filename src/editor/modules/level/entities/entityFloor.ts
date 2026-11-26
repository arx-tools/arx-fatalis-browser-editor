import { Raycaster, Vector3, type Mesh } from 'three'
import type { ArxVector3 } from 'arx-convert/types'

/**
 * How far above the feet of an entity the ray starts, in the units of the game.
 *
 * @remarks
 * The place of an entity is its **feet** (the model stands on it), so an entity that already stands on the floor has the
 * surface right under the ray. A ray that starts exactly on a face may miss it on the floating point numbers of the
 * geometry, so the ray starts a unit above: a surface the feet already touch is found, and a snap of a single unit is
 * nothing next to the height of a player (170).
 */
const RAY_RISE = 1

/**
 * Finds the highest surface under a place of the level.
 *
 * @remarks
 * The drop to floor of an entity and of the spawn of the player: the ray goes **down** from the x/z of the place and the
 * nearest face it meets is the floor under it. The place is the local space of the level, the one the DLF keeps (see
 * `playerSpawn`), so the ray is built in the space of the mesh: the level is `M(v - scenePosition)` of the file, and the
 * place `d` is `M(d)` of the same space (`M` mirrors X and Y). The game's Y points **down**, so a step down the game's
 * axis is a step down the world's Y as well, and the height of the hit comes back the same way it went in: `y = -hit.y`.
 *
 * The mesh is the level's own (`map.solidMeshes[0]`): its matrix is the identity, and its geometry is the faces of the
 * level in that space. Its BVH carries the first hit only, so the answer is the nearest face of the ray, which is the
 * highest surface under the entity.
 *
 * @param mesh The solid mesh of the level.
 * @param place The place of the entity or the spawn, in the local space of the level.
 *
 * @returns The height of the floor under the place, in the same space, or `undefined` when nothing is under it.
 */
export function floorBelow(mesh: Mesh, place: ArxVector3): number | undefined {
  const raycaster = new Raycaster()

  // the place in the space of the mesh: `M(v) = (-x, -y, z)`, and the ray starts a unit above the feet
  raycaster.set(new Vector3(-place.x, -place.y + RAY_RISE, place.z), new Vector3(0, -1, 0))
  // the nearest face is the answer: the tree stops at it instead of reading every face along the ray
  raycaster.firstHitOnly = true

  const hit = raycaster.intersectObject(mesh, false)[0]

  if (hit === undefined) {
    return undefined
  }

  // what `M` mirrored on the way in, it mirrors back on the way out. The subtraction and not the unary minus: a floor
  // at the origin of the level would come back as a negative zero, and a step of the history would hold a place that is
  // not the one the author sees
  return 0 - hit.point.y
}
