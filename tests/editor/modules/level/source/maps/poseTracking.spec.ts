import { describe, it, type TestContext } from 'node:test'
import { cameraAngle, cameraPosition } from '../../../../../../src/editor/components/widgets/camera/cameraState.ts'
import { startPoseTracking, trackPoseOf } from '../../../../../../src/editor/modules/level/source/maps/poseTracking.ts'
import type { StoredPose, StoredPoses } from '../../../../../../src/editor/modules/level/source/maps/mapPoses.ts'

/**
 * The pose the tests move the camera to.
 */
const pose: StoredPose = { position: [1, 2, 3], rotation: [0, 90, 0] }

/**
 * Starts a tracker which writes into the list of the test, and forgets the camera of the previous test.
 *
 * @param t The test, which owns the fake timers.
 *
 * @returns The list of the writes, and the stop of the tracker.
 */
function trackingOfTest(t: TestContext): { written: StoredPoses[]; stop: () => void } {
  t.mock.timers.enable({ apis: ['setTimeout'] })

  cameraPosition.value = undefined
  cameraAngle.value = undefined
  trackPoseOf(undefined)

  const written: StoredPoses[] = []
  const stop = startPoseTracking((poses): void => {
    written.push(poses)
  })

  return { written, stop }
}

/**
 * Hands a pose to the camera refs, the way the walkable view does.
 *
 * @param next The pose to report.
 */
function reportPose(next: StoredPose | undefined): void {
  cameraPosition.value = next?.position
  cameraAngle.value = next?.rotation
}

void describe('startPoseTracking', () => {
  void it('writes the pose of the tracked map once in the window', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)

    trackPoseOf('arx:8')
    reportPose(pose)

    t.assert.deepStrictEqual(written, [])

    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [{ 'arx:8': pose }])
    stop()
  })

  void it('keeps the last pose of the window', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)
    const later: StoredPose = { position: [4, 5, 6], rotation: [0, 45, 0] }

    trackPoseOf('arx:8')
    reportPose(pose)
    reportPose(later)
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [{ 'arx:8': later }])
    stop()
  })

  void it('writes nothing while no map is on the screen', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)

    reportPose(pose)
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [])
    stop()
  })

  void it('writes the waiting pose of a map under the map it came from', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)
    const other: StoredPose = { position: [7, 8, 9], rotation: [10, 20, 0] }

    trackPoseOf('arx:8')
    reportPose(pose)
    // the map changes before the write: the pose of the level that went away is still the pose of that level
    trackPoseOf('arx:11')
    reportPose(other)
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [{ 'arx:8': pose, 'arx:11': other }])
    stop()
  })

  void it('forgets the waiting pose when the camera goes to the spawn', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)

    trackPoseOf('arx:8')
    reportPose(pose)
    reportPose(undefined)
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [])
    stop()
  })

  void it('drops the waiting pose when the tracking stops before the window is over', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)

    trackPoseOf('arx:8')
    reportPose(pose)
    stop()
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [])
  })

  void it('writes nothing after the tracking stopped', (t: TestContext) => {
    const { written, stop } = trackingOfTest(t)

    trackPoseOf('arx:8')
    stop()
    reportPose(pose)
    t.mock.timers.tick(150)

    t.assert.deepStrictEqual(written, [])
  })
})
