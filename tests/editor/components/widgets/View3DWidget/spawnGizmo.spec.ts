import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { movedSpawnOf, turnedSpawnOf } from '../../../../../src/editor/components/widgets/View3DWidget/spawnGizmo.ts'

/**
 * The spawn of the test, with the feet on the floor and facing north.
 */
const SPAWN = { position: { x: 100, y: 0, z: 200 }, yaw: 0 }

/**
 * A turn around the Y axis of the world, in degrees.
 *
 * @param degrees The angle of the turn.
 *
 * @returns The quaternion of the turn.
 */
function turnOf(degrees: number): Quaternion {
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(degrees))
}

void describe('movedSpawnOf', () => {
  void it('takes the two first axes of the game the other way, the way the mesh does', () => {
    const moved = movedSpawnOf(SPAWN, new Vector3(10, 20, 30))

    assert.deepEqual(moved.position, { x: 90, y: -20, z: 230 })
  })

  void it('keeps the yaw of the spawn: a move does not turn the player', () => {
    assert.equal(movedSpawnOf({ ...SPAWN, yaw: 45 }, new Vector3(1, 2, 3)).yaw, 45)
  })

  void it('gives a position of its own, so the step does not share the place of the drag', () => {
    const moved = movedSpawnOf(SPAWN, new Vector3(1, 1, 1))

    assert.notEqual(moved.position, SPAWN.position)
    assert.deepEqual(SPAWN.position, { x: 100, y: 0, z: 200 })
  })
})

void describe('turnedSpawnOf', () => {
  void it('turns the yaw by the vertical part of the turn', () => {
    assert.equal(turnedSpawnOf(SPAWN, turnOf(90)).yaw, 90)
    assert.equal(turnedSpawnOf(SPAWN, turnOf(-45)).yaw, -45)
  })

  void it('adds the turn to the yaw the spawn already has', () => {
    assert.equal(turnedSpawnOf({ ...SPAWN, yaw: 350 }, turnOf(20)).yaw, 370)
  })

  void it('leaves the feet where they were', () => {
    assert.deepEqual(turnedSpawnOf(SPAWN, turnOf(90)).position, SPAWN.position)
  })

  void it('does not take a turn around another axis: the player has a yaw only', () => {
    const sideways = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), MathUtils.degToRad(45))

    assert.equal(turnedSpawnOf(SPAWN, sideways).yaw, 0)
  })
})
