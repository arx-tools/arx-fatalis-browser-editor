import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CameraPose } from '../../../../src/editor/modules/view3d/cameraPose.ts'
import { cameraAngle, cameraPosition } from '../../../../src/editor/modules/view3d/cameraState.ts'
import { createCameraStore, type CameraDriver } from '../../../../src/editor/modules/view3d/cameraStore.ts'

/**
 * A pose the tests move the camera to.
 */
const pose: CameraPose = {
  position: { x: -1716.36, y: 384.4, z: 5227.66 },
  angle: { pitch: 0, yaw: 270 },
}

/**
 * A view that only records what it was asked to show.
 */
interface RecordingDriver extends CameraDriver {
  readonly poses: CameraPose[]
}

/**
 * Builds a driver that records the poses it gets.
 *
 * @returns The driver and the list it fills.
 */
function recordingDriver(): RecordingDriver {
  const poses: CameraPose[] = []

  return {
    poses,
    applyPose: (next: CameraPose): void => {
      poses.push(next)
    },
    moveToSpawn: (): void => {
      poses.push(pose)
    },
  }
}

void describe('createCameraStore', () => {
  void it('has no view and no pose before a view reports one', () => {
    const store = createCameraStore()

    assert.equal(store.hasView.value, false)
    assert.equal(store.pose.value, undefined)
  })

  void it('follows the driver it was given', () => {
    const store = createCameraStore()

    store.setDriver(recordingDriver())

    assert.equal(store.hasView.value, true)
  })

  void it('forgets the view when the driver goes away, but keeps the pose', () => {
    const store = createCameraStore()

    store.setDriver(recordingDriver())
    store.setPose(pose)
    store.setDriver(undefined)

    assert.equal(store.hasView.value, false)
    assert.deepEqual(store.pose.value, pose)
  })

  void it('reports the pose a view handed over', () => {
    const store = createCameraStore()

    store.setPose(pose)

    assert.deepEqual(store.pose.value, pose)
  })
})

void describe('moveCamera', () => {
  void it('sends the pose to the view', () => {
    const store = createCameraStore()
    const driver = recordingDriver()

    store.setDriver(driver)
    store.moveCamera(pose)

    assert.deepEqual(driver.poses, [pose])
  })

  void it('does nothing without a view', () => {
    const store = createCameraStore()

    store.moveCamera(pose)

    assert.equal(store.pose.value, undefined)
  })
})

void describe('moveToSpawn', () => {
  void it('asks the view for the spawn of the level', () => {
    const store = createCameraStore()
    const driver = recordingDriver()

    store.setDriver(driver)
    store.moveToSpawn()

    assert.deepEqual(driver.poses, [pose])
  })

  void it('does nothing without a view', () => {
    const store = createCameraStore()

    store.moveToSpawn()

    assert.equal(store.pose.value, undefined)
  })
})

void describe('the pose of the url', () => {
  void it('is shown before a view mounts', () => {
    cameraPosition.value = [1, 2, 3]
    cameraAngle.value = [0, 270, 0]

    const store = createCameraStore()

    assert.deepEqual(store.pose.value, { position: { x: 1, y: 2, z: 3 }, angle: { pitch: 0, yaw: 270 } })

    cameraPosition.reset()
    cameraAngle.reset()
  })

  void it('is dropped when it does not hold a usable angle', () => {
    cameraPosition.value = [1, 2, 3]
    cameraAngle.value = [0, 400, 0]

    const store = createCameraStore()

    assert.equal(store.pose.value, undefined)

    cameraPosition.reset()
    cameraAngle.reset()
  })

  void it('is dropped when the url carries only half of it', () => {
    cameraAngle.value = [0, 270, 0]

    const store = createCameraStore()

    assert.equal(store.pose.value, undefined)

    cameraAngle.reset()
  })
})
