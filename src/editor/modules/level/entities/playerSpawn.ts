import { shallowRef, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../../generator/ArxMap.ts'

/**
 * Where the player of a level stands and where it faces.
 *
 * @remarks
 * The spawn is the `player` of the DLF: the position is in the **local space of the level** (the mesh is shifted by the
 * scene position, the spawn is not), and the yaw is an angle of the game, in degrees. The game turns the player to the
 * yaw on a load and zeroes the pitch (`src/core/Core.cpp`), so the editor edits the yaw only: a pitch written here
 * would not survive the game.
 */
export type PlayerSpawn = {
  /**
   * Where the player stands, in the game's coordinates.
   */
  readonly position: { readonly x: number; readonly y: number; readonly z: number }
  /**
   * The way the player faces, in degrees, around the Y axis of the game.
   */
  readonly yaw: number
}

/**
 * The revision of the spawn: a number that grows every time the pose of the player is written.
 *
 * @remarks
 * The views read the pose through the player of the map, which is not a reactive value: the revision is the signal a
 * watcher follows (the model of the player, the gizmo), the way the level revision tells the mesh that it changed.
 */
export const spawnRevision: ShallowRef<number> = shallowRef(0)

/**
 * Whether the player model is selected.
 *
 * @remarks
 * The spawn is not a polygon of the level and not an entity of the DLF, so it has no place in the selection store: the
 * gizmo of the player shows while this is true, and the row of the player in the entity list is what sets it.
 */
export const isPlayerSelected: ShallowRef<boolean> = shallowRef(false)

/**
 * Reads the spawn of a level.
 *
 * @param map The map to read.
 *
 * @returns The pose of the player of the level.
 */
export function playerSpawnOf(map: ArxMap): PlayerSpawn {
  const { position, orientation } = map.player

  return { position: { x: position.x, y: position.y, z: position.z }, yaw: orientation.b }
}

/**
 * Writes the spawn of a level.
 *
 * @remarks
 * The player of the map is the player of the **DLF header** (the same objects, see {@link Player}), so a write here is
 * what the export of the level writes: there is no second copy to keep in step.
 *
 * @param map The map to write.
 * @param spawn The pose the player should stand in.
 */
export function setPlayerSpawn(map: ArxMap, spawn: PlayerSpawn): void {
  const { position, orientation } = map.player

  position.x = spawn.position.x
  position.y = spawn.position.y
  position.z = spawn.position.z
  orientation.b = spawn.yaw
  spawnRevision.value = spawnRevision.value + 1
}
