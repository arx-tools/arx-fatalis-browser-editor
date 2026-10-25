import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyCameraValues,
  cameraFieldNames,
  cameraFields,
  commitCameraFields,
  getLastValidCameraValues,
  openCameraDialog,
  parseCameraField,
  readCameraValues,
  type CameraValues,
} from '../src/ui/camera.ts'

/**
 * The camera state the dialog is opened with, the same shape `main.ts` passes.
 */
const POSE: CameraValues = {
  position: { x: 1000.5, y: 200.25, z: -300.75 },
  angle: { pitch: 10, yaw: 180, roll: 0 },
}

/**
 * Fills the six fields from the pose, the way the dialog does when it opens.
 */
function openAtPose(): void {
  openCameraDialog(POSE)
}

void describe('camera fields', () => {
  void it('parses a finite number and rejects everything else', () => {
    const results = [
      parseCameraField('12.5'),
      parseCameraField('0'),
      parseCameraField('-300.75'),
      parseCameraField('1e3'),
      parseCameraField('12abc'),
      parseCameraField(''),
      parseCameraField(' '.repeat(3)),
      parseCameraField('abc'),
      parseCameraField('Infinity'),
      parseCameraField('NaN'),
    ]

    assert.deepEqual(results, [12.5, 0, -300.75, 1000, 12, undefined, undefined, undefined, undefined, undefined])
  })

  void it('fills every field from the pose it is opened with', () => {
    openAtPose()

    assert.deepEqual(
      cameraFieldNames.map((name) => {
        return cameraFields[name]
      }),
      ['1000.50', '200.25', '-300.75', '10.00', '180.00', '0.00'],
    )
  })

  void it('reads the six fields back as the same pose', () => {
    openAtPose()

    assert.deepEqual(readCameraValues(), POSE)
  })

  void it('returns no values while one of the fields is invalid', () => {
    openAtPose()
    cameraFields.yaw = 'not a number'

    assert.equal(readCameraValues(), undefined)
  })

  void it('keeps the last valid pose while a field is invalid', () => {
    openAtPose()
    cameraFields.x = 'oops'

    assert.deepEqual(getLastValidCameraValues(), POSE)
  })

  void it('passes a valid edit on to the camera', () => {
    const applied: CameraValues[] = []
    applyCameraValues.value = (values): void => {
      applied.push(values)
    }

    openAtPose()
    cameraFields.yaw = '90'
    commitCameraFields()

    assert.equal(applied.length, 1)
    assert.deepEqual(applied[0], {
      position: POSE.position,
      angle: { pitch: 10, yaw: 90, roll: 0 },
    })
  })

  void it('does not touch the camera while a field is invalid', () => {
    let called = false
    applyCameraValues.value = (): void => {
      called = true
    }

    openAtPose()
    cameraFields.pitch = '--'
    commitCameraFields()

    assert.equal(called, false)
    assert.deepEqual(getLastValidCameraValues(), POSE)
  })
})
