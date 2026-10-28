import type { ArxDLF, ArxRotation, ArxVector3 } from 'arx-convert/types'

/**
 * The player of a map: where it stands and where it faces.
 *
 * @remarks
 * - the values come from the DLF header: `posEdit` and `angleEdit`
 * - `position` is **relative to the scene position** of the level (`mScenePosition`): the game puts the
 * player to `posEdit + mScenePosition` when it loads a level
 * - `orientation` is an `a`/`b`/`g` angle (pitch, yaw, roll); the game turns the player to it and then
 * zeroes the pitch, so only the yaw survives a load
 * - a teleport does not use these: the game overwrites both with the target entity (or carries the
 * previous pose over), which is why a level's own spawn does not apply on a level change
 *
 * @example
 * ```ts
 * const map = new ArxMap(dlf, fts, llf)
 * const { x, y, z } = map.player.position
 * const yaw = map.player.orientation.b
 * ```
 */
export class Player {
  /**
   * Where the player stands, in the game's coordinate system, relative to the scene position.
   */
  readonly position: ArxVector3
  /**
   * The way the player faces: `a` is the pitch, `b` the yaw, `g` the roll.
   */
  readonly orientation: ArxRotation

  /**
   * Reads the spawn of a level out of its DLF.
   *
   * @param dlf The parsed DLF file of the level.
   */
  constructor(dlf: ArxDLF) {
    this.position = dlf.header.player.position
    this.orientation = dlf.header.player.orientation
  }
}
