import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  PLAYER_EYE_HEIGHT,
  playerEyeOf,
  playerSpawnOf,
  setPlayerSpawn,
  spawnFromCameraOf,
  type PlayerSpawn,
  type SpawnOwner,
} from '../../../../../src/editor/modules/level/entities/playerSpawn.ts'

/**
 * A map with the player of the DLF, at the eye.
 *
 * @param x The x of the eye, in the game's coordinates.
 * @param y The y of the eye, in the game's coordinates.
 * @param z The z of the eye, in the game's coordinates.
 * @param yaw The way the player faces, in degrees.
 *
 * @returns The owner of the spawn, the way the DLF holds it.
 */
function mapOf(x: number, y: number, z: number, yaw = 0): SpawnOwner {
  return { player: { position: { x, y, z }, orientation: { a: 0, b: yaw, g: 0 } } }
}

void describe('the spawn of the player', () => {
  void it('keeps the eye of the player, and the feet are the height of the player below it', () => {
    // the floor is at 0 and the game's Y points down: the eye is at -170, and the feet are on the floor
    const map = mapOf(0, -PLAYER_EYE_HEIGHT, 0)

    assert.deepEqual(playerSpawnOf(map).position, { x: 0, y: 0, z: 0 })
    assert.deepEqual(playerEyeOf(map), { x: 0, y: -PLAYER_EYE_HEIGHT, z: 0 })
  })

  void it('writes the eye of the DLF from the feet the author placed', () => {
    const map = mapOf(0, -PLAYER_EYE_HEIGHT, 0)
    const spawn: PlayerSpawn = { position: { x: 100, y: 10, z: -200 }, yaw: 90 }

    setPlayerSpawn(map, spawn)

    assert.deepEqual(map.player.position, { x: 100, y: 10 - PLAYER_EYE_HEIGHT, z: -200 })
    assert.equal(map.player.orientation.b, 90)
  })

  void it('reads the spawn back after a write, so a move is a round trip', () => {
    const map = mapOf(0, -PLAYER_EYE_HEIGHT, 0)
    const spawn: PlayerSpawn = { position: { x: 10, y: 20, z: 30 }, yaw: 45 }

    setPlayerSpawn(map, spawn)

    assert.deepEqual(playerSpawnOf(map), spawn)
  })

  void it('takes the spawn under the camera: the eye is where it stands, the feet are below it', () => {
    // the camera of the walkable view stands on the eye of the player: the spawn is the same place, the feet below it
    const spawn = spawnFromCameraOf({ x: 100, y: -PLAYER_EYE_HEIGHT, z: 200 }, 45)

    assert.deepEqual(spawn, { position: { x: 100, y: 0, z: 200 }, yaw: 45 })
  })

  void it('leaves the height of the camera in the y of the feet, so a camera in the air makes a spawn there', () => {
    const spawn = spawnFromCameraOf({ x: 0, y: 30, z: 0 }, 0)

    assert.deepEqual(spawn.position, { x: 0, y: 30 + PLAYER_EYE_HEIGHT, z: 0 })
  })

  void it('keeps the y of the spawn off the axis of the renderer, which mirrors it', () => {
    // the renderer mirrors X and Y, so a spawn 170 below the eye is 170 above the floor in the view
    assert.equal(PLAYER_EYE_HEIGHT, 170)
  })
})
