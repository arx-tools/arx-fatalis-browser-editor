import type { PlayerSpawn } from '../../level/entities/playerSpawn.ts'
import { HISTORY_RECORD_VERSION, type SetSpawnRecord, type SpawnSnapshot } from './types.ts'

/**
 * Copies a spawn of a step, so the record does not share the vector of the level.
 *
 * @param spawn The spawn to copy.
 *
 * @returns The spawn with a position of its own.
 */
function copySpawnOf(spawn: PlayerSpawn): SpawnSnapshot {
  return {
    position: { x: spawn.position.x, y: spawn.position.y, z: spawn.position.z },
    yaw: spawn.yaw,
  }
}

/**
 * Builds the record of a move of the spawn, the way a step writes it down.
 *
 * @remarks
 * The two snapshots are copied: the map keeps the live spawn, and a later edit of it must not reach back into the step.
 *
 * @param before The spawn before the step.
 * @param after The spawn after it.
 *
 * @returns The record of the step.
 */
export function createSetSpawnRecord(before: PlayerSpawn, after: PlayerSpawn): SetSpawnRecord {
  return {
    version: HISTORY_RECORD_VERSION,
    kind: 'setSpawn',
    before: copySpawnOf(before),
    after: copySpawnOf(after),
  }
}
