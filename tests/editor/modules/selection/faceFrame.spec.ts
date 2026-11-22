import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ArxPolygonFlags, type ArxPolygon } from 'arx-convert/types'
import { faceFrameOf, gameAngleOf } from '../../../../src/editor/modules/selection/faceFrame.ts'

/**
 * Builds a face the way the level holds one: four vertex slots and a normal.
 *
 * @param vertices The corners of the face, in the game's coordinates.
 * @param normal The normal of the face.
 *
 * @returns The face.
 */
function polygonOf(
  vertices: ReadonlyArray<readonly [number, number, number]>,
  normal: readonly [number, number, number],
): ArxPolygon {
  const slots = [0, 1, 2, 3].map((index) => {
    const [x, y, z] = vertices[Math.min(index, vertices.length - 1)] ?? [0, 0, 0]

    return { x, y, z, u: 0, v: 0 }
  })

  return {
    vertices: [slots[0], slots[1], slots[2], slots[3]],
    textureContainerId: 0,
    norm: { x: normal[0], y: normal[1], z: normal[2] },
    norm2: { x: normal[0], y: normal[1], z: normal[2] },
    transval: 0,
    area: 1,
    flags: ArxPolygonFlags.Quad,
    room: 0,
  }
}

void describe('gameAngleOf', () => {
  void it('reads the yaw of the four horizontal directions the fixed views set', () => {
    // the table of `cameraAlign.ts`: yaw 0 looks along +Z, 90 along -X, 180 along -Z and 270 along +X
    assert.deepStrictEqual(gameAngleOf({ x: 0, y: 0, z: 1 }), { pitch: 0, yaw: 0 })
    assert.deepStrictEqual(gameAngleOf({ x: -1, y: 0, z: 0 }), { pitch: 0, yaw: 90 })
    assert.deepStrictEqual(gameAngleOf({ x: 0, y: 0, z: -1 }), { pitch: 0, yaw: 180 })
    assert.deepStrictEqual(gameAngleOf({ x: 1, y: 0, z: 0 }), { pitch: 0, yaw: 270 })
  })

  void it('reads the pitch of a look down and a look up', () => {
    // the game's Y points down, so a positive pitch looks down
    assert.deepStrictEqual(gameAngleOf({ x: 0, y: 1, z: 0 }), { pitch: 90, yaw: 0 })
    assert.deepStrictEqual(gameAngleOf({ x: 0, y: -1, z: 0 }), { pitch: -90, yaw: 0 })
  })

  void it('keeps the pitch of a slanted look', () => {
    const angle = gameAngleOf({ x: 0, y: 1, z: 1 })

    assert.ok(Math.abs(angle.pitch - 45) < 0.001)
    assert.ok(Math.abs(angle.yaw) < 0.001)
  })

  void it('falls back to the zero angle for a direction of no length', () => {
    assert.deepStrictEqual(gameAngleOf({ x: 0, y: 0, z: 0 }), { pitch: 0, yaw: 0 })
  })
})

void describe('faceFrameOf', () => {
  void it('stands in front of the face along its normal, looking at its middle', () => {
    // a 100 x 100 quad on the z = 0 plane, its normal towards +Z: the eye goes to the +Z side and looks back
    const frame = faceFrameOf(
      polygonOf(
        [
          [0, 0, 0],
          [100, 0, 0],
          [100, 100, 0],
          [0, 100, 0],
        ],
        [0, 0, 1],
      ),
    )

    assert.notEqual(frame, undefined)
    assert.deepStrictEqual(frame?.centre, { x: 50, y: 50, z: 0 })
    assert.ok(Math.abs((frame?.radius ?? 0) - 70.71) < 0.01)

    // the radius decides the distance: three of them, and the eye is on the normal side
    const distance = (frame?.radius ?? 0) * 3

    assert.ok(Math.abs((frame?.pose.position.z ?? 0) - distance) < 0.01)
    assert.ok(Math.abs((frame?.pose.position.x ?? 0) - 50) < 0.001)
    assert.deepStrictEqual(frame?.pose.angle, { pitch: 0, yaw: 180 })
  })

  void it('keeps the minimum distance for a face smaller than it', () => {
    const frame = faceFrameOf(
      polygonOf(
        [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0],
        ],
        [0, 0, 1],
      ),
    )

    // the radius is about 7: three of it is under the minimum of 60, and the eye stands at 60
    assert.ok(Math.abs((frame?.pose.position.z ?? 0) - 60) < 0.001)
  })

  void it('follows the normal of the face', () => {
    // a floor facing up: the game's Y points down, so its normal is -Y and the eye goes above it
    const frame = faceFrameOf(
      polygonOf(
        [
          [0, 0, 0],
          [100, 0, 0],
          [100, 0, 100],
          [0, 0, 100],
        ],
        [0, -1, 0],
      ),
    )

    // the eye stands above the floor and looks down at it (a positive pitch looks down), with the game's +Z up on the
    // screen (the yaw of the `top` fixed view)
    assert.ok((frame?.pose.position.y ?? 0) < 0)
    assert.deepStrictEqual(frame?.pose.angle, { pitch: 90, yaw: 0 })
  })

  void it('has no frame for a face without a normal', () => {
    const frame = faceFrameOf(
      polygonOf(
        [
          [0, 0, 0],
          [100, 0, 0],
          [100, 100, 0],
          [0, 100, 0],
        ],
        [0, 0, 0],
      ),
    )

    assert.strictEqual(frame, undefined)
  })
})
