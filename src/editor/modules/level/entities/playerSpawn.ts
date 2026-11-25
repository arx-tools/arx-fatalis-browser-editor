import type { ArxRotation, ArxVector3 } from 'arx-convert/types'
import { shallowRef, type ShallowRef } from 'vue'

/**
 * How high the eye of the player is above its feet, in the game's units.
 *
 * @remarks
 * The `player` of the DLF stores the **eye** of the player, not its feet: the engine keeps the collision of the player
 * from `basePosition()` (the position minus `baseHeight()`), and `baseHeight()` is `-170` in the source of Arx
 * Libertatis (Y points down, so the feet are 170 below the eye). The old generator used 180 (a value found by trial and
 * error); the engine's 170 is the one the game puts on the floor (2026-11-25, the owner: the player of the minigame
 * stands on the ground).
 */
export const PLAYER_EYE_HEIGHT = 170

/**
 * What the spawn of a level is read from, and written to: the player of the map, which is the player of the DLF header.
 *
 * @remarks
 * The shape is the one of the map's `player` (the `ArxMap` satisfies it), so a step of the history can write the spawn
 * against a level it holds without knowing the rest of the map.
 */
export type SpawnOwner = {
  /**
   * The player of the level: the eye of the spawn, and the way it faces.
   */
  readonly player: {
    readonly position: ArxVector3
    readonly orientation: ArxRotation
  }
}

/**
 * Where the player of a level stands and where it faces.
 *
 * @remarks
 * The spawn is the **feet** of the player: the author puts it on the floor, and the eye is {@link PLAYER_EYE_HEIGHT}
 * above it. The DLF keeps the eye, so the two conversions live in this module ({@link playerSpawnOf} and
 * {@link setPlayerSpawn}); the position is in the **local space of the level** (the mesh is shifted by the scene
 * position, the spawn is not), and the yaw is an angle of the game, in degrees. The game turns the player to the yaw on
 * a load and zeroes the pitch (`src/core/Core.cpp`), so the editor edits the yaw only: a pitch written here would not
 * survive the game.
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
 * @returns The pose of the player of the level, with the feet at the spawn.
 */
export function playerSpawnOf(map: SpawnOwner): PlayerSpawn {
  const { position, orientation } = map.player

  // the game's Y points down, so the feet are the eye plus the height of the player
  return {
    position: { x: position.x, y: position.y + PLAYER_EYE_HEIGHT, z: position.z },
    yaw: orientation.b,
  }
}

/**
 * The eye of the player of a level, in the game's coordinates.
 *
 * @remarks
 * The camera of the walkable view stands here, at the spawn of the level: the DLF keeps this point, and the spawn the
 * author edits is the feet under it.
 *
 * @param map The map to read.
 *
 * @returns The eye of the player, the way the DLF stores it.
 */
export function playerEyeOf(map: SpawnOwner): { readonly x: number; readonly y: number; readonly z: number } {
  const { position } = map.player

  return { x: position.x, y: position.y, z: position.z }
}

/**
 * Writes the spawn of a level.
 *
 * @remarks
 * The player of the map is the player of the **DLF header** (the same objects, see {@link Player}), so a write here is
 * what the export of the level writes: there is no second copy to keep in step.
 *
 * @param map The map to write.
 * @param spawn The pose the player should stand in, with the feet at the spawn.
 */
export function setPlayerSpawn(map: SpawnOwner, spawn: PlayerSpawn): void {
  const { position, orientation } = map.player

  position.x = spawn.position.x
  // the DLF keeps the eye: the feet the author placed are the height of the player below it
  position.y = spawn.position.y - PLAYER_EYE_HEIGHT
  position.z = spawn.position.z
  orientation.b = spawn.yaw
  spawnRevision.value = spawnRevision.value + 1
}
