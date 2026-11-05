import type { ArxVector3 } from 'arx-convert/types'

/**
 * A box of the level, in the game's coordinate system.
 *
 * @remarks
 * The fixed views align to the **level**, so the box comes from the bounding box of the mesh (see
 * `gameBoundsOf`). The archived editor aligned to the anchor graph instead; the anchors are not ported yet,
 * and the level is the next best answer to "show me the whole thing".
 */
export interface CameraBounds {
  /**
   * The corner with the smallest coordinates.
   */
  readonly min: ArxVector3
  /**
   * The corner with the largest coordinates.
   */
  readonly max: ArxVector3
}

/**
 * Reads the centre of a box.
 *
 * @param bounds The box to read.
 *
 * @returns The point in the middle of it, in the game's coordinates.
 */
export function centreOfBounds(bounds: CameraBounds): ArxVector3 {
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  }
}
