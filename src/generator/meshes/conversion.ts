import type { ArxVector3 } from 'arx-convert/types'
import { Vector3 } from 'three'

/**
 * Mirrors one game position into the three.js space.
 *
 * @remarks
 * The game's coordinate system is mirrored on the X and Y axes compared to three.js, so every point of
 * the mesh goes through `M(x, y, z) = (-x, -y, z)`. The level is also shifted by its scene position, so
 * the widget does not have to deal with the large absolute coordinates of the game.
 *
 * @param vector The point in the game's coordinate system.
 *
 * @returns The same point in the three.js space.
 */
export function arxVector3toVector3(vector: ArxVector3): Vector3 {
  return new Vector3(-vector.x, -vector.y, vector.z)
}
