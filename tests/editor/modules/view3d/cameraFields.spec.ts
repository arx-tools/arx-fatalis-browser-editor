import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cameraFieldNames,
  emptyFields,
  formatPose,
  invalidFields,
  parseField,
  parsePose,
  stepField,
  stepSize,
  syncFields,
  type CameraFields,
} from '../../../../src/editor/modules/view3d/cameraFields.ts'
import type { CameraPose } from '../../../../src/editor/modules/view3d/cameraPose.ts'

/**
 * A pose with a negative coordinate in every axis, so a lost sign shows up.
 */
const pose: CameraPose = {
  position: { x: -1716.36, y: 384.4, z: 5227.66 },
  angle: { pitch: -12.345, yaw: 270.5 },
}

/**
 * The text of {@link pose}.
 */
const fields: CameraFields = {
  x: '-1716.36',
  y: '384.4',
  z: '5227.66',
  pitch: '-12.345',
  yaw: '270.5',
  roll: '0.00',
}

void describe('parseField', () => {
  void it('reads a number', () => {
    assert.equal(parseField('12.5'), 12.5)
  })

  void it('ignores the spaces around the number', () => {
    assert.equal(parseField('  -3.5  '), -3.5)
  })

  void it('rejects an empty field', () => {
    assert.equal(parseField(''), undefined)
  })

  void it('rejects a field of spaces', () => {
    assert.equal(parseField(' '.repeat(3)), undefined)
  })

  void it('rejects a text', () => {
    assert.equal(parseField('abc'), undefined)
  })

  void it('rejects an infinity', () => {
    assert.equal(parseField('Infinity'), undefined)
  })
})

void describe('parsePose', () => {
  void it('reads the six fields as a pose', () => {
    assert.deepEqual(parsePose(fields), pose)
  })

  void it('keeps the fractions, the rounding is the job of the camera', () => {
    const parsed = parsePose({ ...fields, x: '1.23456789' })

    assert.equal(parsed?.position.x, 1.234_567_89)
  })

  void it('rejects a pose with an empty field', () => {
    assert.equal(parsePose({ ...fields, y: '' }), undefined)
  })

  void it('rejects a pose with a text in a field', () => {
    assert.equal(parsePose({ ...fields, pitch: 'left' }), undefined)
  })

  void it('rejects a pose with a broken roll, because the form would be half read', () => {
    assert.equal(parsePose({ ...fields, roll: 'x' }), undefined)
  })

  void it('does not carry the roll into the pose', () => {
    const parsed = parsePose({ ...fields, roll: '45' })

    assert.deepEqual(Object.keys(parsed?.angle ?? {}), ['pitch', 'yaw'])
  })
})

void describe('invalidFields', () => {
  void it('marks nothing on a full form', () => {
    assert.deepEqual(
      cameraFieldNames.filter((name) => {
        return invalidFields(fields)[name]
      }),
      [],
    )
  })

  void it('marks the field that does not hold a number', () => {
    const marked = invalidFields({ ...fields, z: 'oops' })

    assert.equal(marked.z, true)
    assert.equal(marked.x, false)
  })

  void it('marks an empty field too', () => {
    assert.equal(invalidFields({ ...fields, yaw: '' }).yaw, true)
  })
})

void describe('formatPose', () => {
  void it('writes two decimals into every field', () => {
    assert.deepEqual(formatPose(pose), {
      x: '-1716.36',
      y: '384.40',
      z: '5227.66',
      pitch: '-12.34',
      yaw: '270.50',
      roll: '0.00',
    })
  })

  void it('writes the roll as zero, the camera has none', () => {
    assert.equal(formatPose({ position: { x: 0, y: 0, z: 0 }, angle: { pitch: 0, yaw: 0 } }).roll, '0.00')
  })

  void it('rounds the way the url does, so the two can not disagree', () => {
    assert.equal(formatPose({ position: { x: 2.345, y: 0, z: 0 }, angle: { pitch: 0, yaw: 0 } }).x, '2.35')
  })
})

void describe('emptyFields', () => {
  void it('has every field and nothing in it', () => {
    const empty = emptyFields()

    assert.deepEqual(Object.keys(empty).toSorted(), [...cameraFieldNames].toSorted())
    assert.deepEqual(
      cameraFieldNames.filter((name) => {
        return empty[name] !== ''
      }),
      [],
    )
  })
})

void describe('syncFields', () => {
  void it('follows the pose when no field has the focus', () => {
    assert.deepEqual(syncFields(emptyFields(), fields, undefined), fields)
  })

  void it('keeps the text of the field that has the focus', () => {
    const typing: CameraFields = { ...emptyFields(), x: '-17' }

    const synced = syncFields(typing, fields, 'x')

    assert.equal(synced.x, '-17')
    assert.equal(synced.y, fields.y)
  })

  void it('follows every field after the focus is gone', () => {
    const typing: CameraFields = { ...emptyFields(), x: '-17' }

    assert.deepEqual(syncFields(typing, fields, undefined), fields)
  })
})

void describe('stepField', () => {
  void it('rounds the value before it steps up', () => {
    assert.equal(stepField('3533.64', 1, ''), '3544')
  })

  void it('rounds the value before it steps down', () => {
    assert.equal(stepField('3533.64', -1, ''), '3524')
  })

  void it('steps a whole number by the step size', () => {
    assert.equal(stepField('500', 1, ''), '510')
    assert.equal(stepField('500', -1, ''), '490')
  })

  void it('rounds a negative half up, like Math.round', () => {
    assert.equal(stepField('-10.5', 1, ''), '0')
  })

  void it('starts a broken field from the value the camera holds', () => {
    assert.equal(stepField('abc', 1, '100.7'), '111')
  })

  void it('starts an empty field from the value the camera holds', () => {
    assert.equal(stepField('', -1, '20'), '10')
  })

  void it('starts from zero when neither the field nor the camera has a value', () => {
    assert.equal(stepField('', 1, ''), '10')
  })

  void it('keeps the step of the inputs and the step of the arrows the same', () => {
    assert.equal(stepSize, 10)
  })
})
