import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  SPAWN_TARGET_ID,
  jumpTargets,
  jumpTo,
  type JumpCamera,
  type JumpTarget,
} from '../../../../../src/editor/components/widgets/JumpToLocationWidget/locations.ts'
import type { CameraPose } from '../../../../../src/editor/components/widgets/cameraPose.ts'

/**
 * A pose the tests jump to.
 */
const pose: CameraPose = {
  position: { x: -1716.36, y: 384.4, z: 5227.66 },
  angle: { pitch: 0, yaw: 270 },
}

/**
 * A camera that only records what it was asked to do.
 *
 * @returns The camera and the lists it fills.
 */
function recordingCamera(): { camera: JumpCamera; spawns: number[]; poses: CameraPose[] } {
  const spawns: number[] = []
  const poses: CameraPose[] = []

  return {
    spawns,
    poses,
    camera: {
      moveToSpawn: (): void => {
        spawns.push(1)
      },
      moveCamera: (next: CameraPose): void => {
        poses.push(next)
      },
    },
  }
}

void describe('jumpTargets', () => {
  void it('offers the spawn of the level first', () => {
    const targets = jumpTargets()

    assert.ok(targets.length > 0)
    assert.equal(targets[0]?.kind, 'spawn')
    assert.equal(targets[0]?.id, SPAWN_TARGET_ID)
  })

  void it('gives a label to every target', () => {
    const unlabelled = jumpTargets().filter((target) => {
      return target.label.trim() === ''
    })

    assert.deepEqual(unlabelled, [])
  })

  void it('gives one id to one target', () => {
    const ids = jumpTargets().map((target) => {
      return target.id
    })

    assert.equal(new Set(ids).size, ids.length)
  })
})

void describe('jumpTo', () => {
  void it('moves the camera to the spawn', () => {
    const { camera, spawns, poses } = recordingCamera()

    const moved = jumpTo(jumpTargets(), SPAWN_TARGET_ID, camera)

    assert.equal(moved, true)
    assert.equal(spawns.length, 1)
    assert.deepEqual(poses, [])
  })

  void it('moves the camera to the pose of a point', () => {
    const targets: JumpTarget[] = [{ kind: 'pose', id: 'an-entity', label: 'An entity', pose }]
    const { camera, spawns, poses } = recordingCamera()

    const moved = jumpTo(targets, 'an-entity', camera)

    assert.equal(moved, true)
    assert.equal(spawns.length, 0)
    assert.deepEqual(poses, [pose])
  })

  void it('does nothing for an id that is not in the list', () => {
    const { camera, spawns, poses } = recordingCamera()

    const moved = jumpTo(jumpTargets(), 'not-a-target', camera)

    assert.equal(moved, false)
    assert.deepEqual(spawns, [])
    assert.deepEqual(poses, [])
  })
})
