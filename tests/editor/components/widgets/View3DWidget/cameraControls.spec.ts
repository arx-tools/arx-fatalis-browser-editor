import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ArxDLF } from 'arx-convert/types'
// a type only import disappears at compile time, so it can come before the dom is installed
import type { CameraPose } from '../../../../../src/editor/components/widgets/cameraPose.ts'
import { installDom } from '../../../../support/dom.ts'

// the controls build a pointer lock and start the keyboard module: both want a document
installDom()

const { PerspectiveCamera, Vector3 } = await import('three')
const { CameraControls } = await import('../../../../../src/editor/components/widgets/View3DWidget/cameraControls.ts')
const { cameraAngle, cameraPosition } = await import('../../../../../src/editor/components/widgets/cameraState.ts')
const { Player } = await import('../../../../../src/generator/Player.ts')
const { gamePositionToWorld } = await import('../../../../../src/editor/components/widgets/cameraPose.ts')

/**
 * The scene position of the test level.
 */
const scene = { x: 5250, y: 1225, z: 4350 }

/**
 * The spawn of the test level: a mirrored position and a yaw of its own.
 */
const player = new Player({
  header: {
    player: {
      position: { x: -1716.36, y: 384.4, z: 5227.66 },
      orientation: { a: 12, b: 104.52, g: 0 },
    },
  },
} as unknown as ArxDLF)

/**
 * One pose the controls reported.
 */
type ReportedPose = CameraPose

/**
 * Builds the controls of the test: a camera, the scene and the spawn above.
 *
 * @returns The controls, its camera and the list of the poses it reported.
 */
function buildControls(): {
  controls: InstanceType<typeof CameraControls>
  camera: InstanceType<typeof PerspectiveCamera>
  poses: ReportedPose[]
} {
  const camera = new PerspectiveCamera(75, 1.5, 0.1, 10_000)
  const canvas = document.createElement('canvas')
  const poses: ReportedPose[] = []
  const controls = new CameraControls({
    canvas,
    camera,
    scene,
    player,
    onPoseChange: (pose): void => {
      poses.push(pose)
    },
  })

  return { controls, camera, poses }
}

/**
 * Rounds a number for the comparison.
 *
 * @remarks
 * The pose goes through the rotation of the camera and back, so the floats come back with the noise of
 * that round trip: the tests compare the two decimals the editor actually shows.
 *
 * @param value The number to round.
 *
 * @returns The number, rounded to two decimals.
 */
function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Rounds the channels of a vector for the comparison.
 *
 * @param vector The vector to read.
 *
 * @returns The channels, rounded to two decimals.
 */
function roundedChannels(vector: InstanceType<typeof Vector3>): number[] {
  return [vector.x, vector.y, vector.z].map(rounded)
}

void describe('CameraControls', () => {
  void it('starts at the spawn of the level, with the yaw of the level and no pitch', () => {
    const { camera, poses } = buildControls()

    assert.deepEqual(roundedChannels(camera.position), [1716.36, -384.4, 5227.66])
    assert.equal(poses.at(-1)?.angle.pitch, 0)
    assert.equal(rounded(poses.at(-1)?.angle.yaw ?? 0), 104.52)
  })

  void it('applies a pose and reports it in the game coordinates', () => {
    const { controls, camera, poses } = buildControls()

    controls.applyPose({ position: { x: -100, y: 200, z: 500 }, angle: { pitch: 0, yaw: 270 } })

    assert.deepEqual(
      roundedChannels(camera.position),
      roundedChannels(gamePositionToWorld({ x: -100, y: 200, z: 500 }, scene)),
    )
    assert.deepEqual(poses.at(-1)?.position, { x: -100, y: 200, z: 500 })
    assert.deepEqual(poses.at(-1)?.angle, { pitch: 0, yaw: 270 })
    controls.dispose()
  })

  void it('writes the pose into the persistable refs', () => {
    const { controls } = buildControls()

    controls.applyPose({ position: { x: 1.234, y: -5.678, z: 9.876 }, angle: { pitch: 12, yaw: 34 } })

    assert.deepEqual(cameraPosition.value?.map(rounded), [1.23, -5.68, 9.88])
    assert.deepEqual(cameraAngle.value?.map(rounded), [12, 34, 0])
    controls.dispose()
    cameraPosition.reset()
    cameraAngle.reset()
  })

  void it('jumps back to the spawn, whatever the camera shows', () => {
    const { controls, camera } = buildControls()

    controls.applyPose({ position: { x: -100, y: 200, z: 500 }, angle: { pitch: 0, yaw: 270 } })
    controls.applySpawnPose()

    assert.deepEqual(roundedChannels(camera.position), [1716.36, -384.4, 5227.66])
    controls.dispose()
  })

  void it('is not locked without a pointer lock request', () => {
    const { controls } = buildControls()

    assert.equal(controls.isLocked, false)
    controls.dispose()
  })
})
