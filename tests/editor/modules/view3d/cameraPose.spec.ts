import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  applyGameAngle,
  gamePositionToWorld,
  isGameAngleInRange,
  readCameraPose,
  readGameAngle,
  setCameraPose,
  worldPositionToGame,
  type CameraPose,
} from '../../../../src/editor/modules/view3d/cameraPose.ts'

/**
 * The scene position of the test level.
 */
const scene = { x: 5250, y: 1225, z: 4350 }

/**
 * Rounds the numbers of a vector for the comparison.
 *
 * @param vector The vector to read.
 *
 * @returns The channels, rounded to two decimals.
 */
function rounded(vector: Vector3): number[] {
  return [vector.x, vector.y, vector.z].map((value) => {
    return Math.round(value * 100) / 100
  })
}

void describe('gamePositionToWorld', () => {
  void it('mirrors the X and Y axes around the scene position', () => {
    const world = gamePositionToWorld({ x: -1716.36, y: 384.4, z: 5227.66 }, scene)

    assert.deepEqual(rounded(world), [6966.36, 840.6, 877.66])
  })
})

void describe('worldPositionToGame', () => {
  void it('is the inverse of the forward conversion', () => {
    const game = { x: -1716.36, y: 384.4, z: 5227.66 }
    const back = worldPositionToGame(gamePositionToWorld(game, scene), scene)

    assert.deepEqual(
      [back.x, back.y, back.z].map((value) => {
        return Math.round(value * 100) / 100
      }),
      [game.x, game.y, game.z],
    )
  })
})

/**
 * Rounds a difference to three decimals, without a signed zero.
 *
 * @param value The difference to round.
 *
 * @returns The rounded value.
 */
function roundDifference(value: number): number {
  const rounded = Math.round(value * 1000) / 1000

  if (rounded === 0) {
    return 0
  }

  return rounded
}

void describe('applyGameAngle and readGameAngle', () => {
  void it('round trips the yaw', () => {
    const camera = new PerspectiveCamera()
    const results = [0, 45, 90, 104.52, 180, 270, 359.5].map((yaw) => {
      applyGameAngle(camera, { pitch: 0, yaw })

      return roundDifference(readGameAngle(camera).yaw - yaw)
    })

    assert.deepEqual(
      results,
      results.map(() => {
        return 0
      }),
    )
  })

  void it('round trips the pitch', () => {
    const camera = new PerspectiveCamera()
    const results = [-90, -45, 0, 22.5, 90].map((pitch) => {
      applyGameAngle(camera, { pitch, yaw: 180 })

      return roundDifference(readGameAngle(camera).pitch - pitch)
    })

    assert.deepEqual(
      results,
      results.map(() => {
        return 0
      }),
    )
  })

  void it('looks towards minus Z at a game yaw of 180', () => {
    const camera = new PerspectiveCamera()
    applyGameAngle(camera, { pitch: 0, yaw: 180 })

    const direction = camera.getWorldDirection(new Vector3())

    assert.ok(direction.z < -0.99)
  })

  void it('has no roll', () => {
    const camera = new PerspectiveCamera()
    applyGameAngle(camera, { pitch: 10, yaw: 200 })

    assert.ok(Math.abs(camera.rotation.z) < 1e-9)
  })
})

void describe('isGameAngleInRange', () => {
  void it('accepts a full turn and the poles', () => {
    assert.equal(isGameAngleInRange({ pitch: 0, yaw: 0 }), true)
    assert.equal(isGameAngleInRange({ pitch: -90, yaw: 359.9 }), true)
    assert.equal(isGameAngleInRange({ pitch: 90, yaw: 180 }), true)
  })

  void it('rejects a broken yaw or pitch', () => {
    assert.equal(isGameAngleInRange({ pitch: 0, yaw: 360 }), false)
    assert.equal(isGameAngleInRange({ pitch: 0, yaw: -1 }), false)
    assert.equal(isGameAngleInRange({ pitch: 91, yaw: 0 }), false)
    assert.equal(isGameAngleInRange({ pitch: -91, yaw: 0 }), false)
  })
})

void describe('setCameraPose and readCameraPose', () => {
  void it('puts the camera to the pose the game asks for', () => {
    const camera = new PerspectiveCamera()
    const pose: CameraPose = { position: { x: -1716.36, y: 384.4, z: 5227.66 }, angle: { pitch: 0, yaw: 270 } }

    setCameraPose(camera, scene, pose)

    assert.deepEqual(rounded(camera.position), [6966.36, 840.6, 877.66])
    // a game yaw of 270 looks towards the negative X of three, which is the positive X of the game
    const direction = camera.getWorldDirection(new Vector3())
    assert.ok(Math.abs(direction.x + 1) < 1e-9)
  })

  void it('reads the pose back, so a set and a read are the same pose', () => {
    const camera = new PerspectiveCamera()
    const pose: CameraPose = { position: { x: -1716.36, y: 384.4, z: 5227.66 }, angle: { pitch: -12, yaw: 270 } }

    setCameraPose(camera, scene, pose)
    const read = readCameraPose(camera, scene)

    assert.deepEqual(
      [read.position.x, read.position.y, read.position.z].map((value) => {
        return Math.round(value * 100) / 100
      }),
      [pose.position.x, pose.position.y, pose.position.z],
    )
    assert.equal(roundDifference(read.angle.pitch - pose.angle.pitch), 0)
    assert.equal(roundDifference(read.angle.yaw - pose.angle.yaw), 0)
  })
})
