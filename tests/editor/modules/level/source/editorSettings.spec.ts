import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDeleteFacesRecord } from '../../../../../src/editor/modules/history/records.ts'
import {
  editorSettingsJsonOf,
  editorSettingsOfValue,
  SETTINGS_PATH,
} from '../../../../../src/editor/modules/level/source/editorSettings.ts'
import type { StoredPose } from '../../../../../src/editor/modules/level/source/maps/mapPoses.ts'

/**
 * The pose the tests write: where the camera stands on a level of the game.
 */
const camera: StoredPose = { position: [5320.35, 307.39, 10_713.8], rotation: [0, 180, 0] }

/**
 * The step the tests write: a delete of the first face.
 */
const record = createDeleteFacesRecord([0])

void describe('SETTINGS_PATH', () => {
  void it('is the state of the editor, in the folder of the editor', () => {
    assert.equal(SETTINGS_PATH, 'editor/settings.json')
  })
})

void describe('editorSettingsJsonOf', () => {
  void it('writes the pose of the camera alone when the level has no steps', () => {
    assert.deepEqual(editorSettingsJsonOf({ camera }), { camera })
  })

  void it('writes the steps in the shape the browser stores them', () => {
    const value = editorSettingsJsonOf({ camera, history: { fingerprint: 'abc:10', records: [record], position: 1 } })

    assert.deepEqual(value.camera, camera)
    assert.deepEqual(value.history, { version: 2, fingerprint: 'abc:10', records: [record], position: 1 })
  })

  void it('writes the steps without a camera, when the archive has no pose', () => {
    const value = editorSettingsJsonOf({ history: { fingerprint: 'abc:10', records: [record], position: 1 } })

    assert.equal(value.camera, undefined)
    assert.equal(value.history?.version, 2)
  })
})

void describe('editorSettingsOfValue', () => {
  void it('reads the pose and the steps', () => {
    const settings = editorSettingsOfValue({
      camera,
      history: { version: 2, fingerprint: 'abc:10', records: [record], position: 1 },
    })

    assert.deepEqual(settings?.camera, camera)
    assert.equal(settings?.history?.fingerprint, 'abc:10')
    assert.equal(settings?.history?.position, 1)
  })

  void it('reads a file that holds only one of the two', () => {
    assert.deepEqual(editorSettingsOfValue({ camera })?.camera, camera)
    assert.equal(editorSettingsOfValue({ camera })?.history, undefined)
    assert.equal(
      editorSettingsOfValue({ history: { version: 2, fingerprint: 'abc:10', records: [record], position: 0 } })?.camera,
      undefined,
    )
  })

  void it('drops the pose alone when the camera can not take it', () => {
    // a pose of another build does not take the steps of the level with it: each half is read on its own
    const settings = editorSettingsOfValue({
      camera: { position: [1, 2], rotation: [0, 0, 0] },
      history: { version: 2, fingerprint: 'abc:10', records: [record], position: 1 },
    })

    assert.equal(settings?.camera, undefined)
    assert.equal(settings?.history?.fingerprint, 'abc:10')
  })

  void it('reads nothing from a value that is not a settings file', () => {
    assert.equal(editorSettingsOfValue(undefined), undefined)
    assert.equal(editorSettingsOfValue('a settings file'), undefined)
    assert.equal(editorSettingsOfValue([camera]), undefined)
  })
})
