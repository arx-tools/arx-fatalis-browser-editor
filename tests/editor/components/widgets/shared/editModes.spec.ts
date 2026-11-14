import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextTick } from 'vue'
import {
  editModeSwitches,
  rotateVisible,
  scaleVisible,
  startEditModes,
  transformVisible,
} from '../../../../../src/editor/components/widgets/shared/editModes.ts'

/**
 * Waits for the watches of the modes to run, and reads the two switches.
 *
 * @returns Whether the transform and the rotate gizmo are shown.
 */
async function modes(): Promise<{ transform: boolean; rotate: boolean; scale: boolean }> {
  await nextTick()

  return { transform: transformVisible.value, rotate: rotateVisible.value, scale: scaleVisible.value }
}

void describe('the edit modes', () => {
  startEditModes()

  void it('starts with the transform on and the rotate off', async () => {
    transformVisible.value = true
    rotateVisible.value = false
    scaleVisible.value = false

    assert.deepEqual(await modes(), { transform: true, rotate: false, scale: false })
  })

  void it('puts the transform away when the rotate comes on', async () => {
    rotateVisible.value = true

    assert.deepEqual(await modes(), { transform: false, rotate: true, scale: false })
  })

  void it('puts the rotate away when the transform comes on', async () => {
    transformVisible.value = true

    assert.deepEqual(await modes(), { transform: true, rotate: false, scale: false })
  })

  void it('leaves no gizmo when the mode that is on is put away', async () => {
    transformVisible.value = false

    assert.deepEqual(await modes(), { transform: false, rotate: false, scale: false })
  })

  void it('puts the rotate and the transform away when the scale comes on', async () => {
    transformVisible.value = true
    await modes()
    scaleVisible.value = true

    assert.deepEqual(await modes(), { transform: false, rotate: false, scale: true })
  })

  void it('puts the scale away when the transform comes on', async () => {
    transformVisible.value = true

    assert.deepEqual(await modes(), { transform: true, rotate: false, scale: false })
  })

  void it('is the switch list of the key help, with the value each one starts from', () => {
    assert.equal(editModeSwitches.transform.defaultValue, true)
    assert.equal(editModeSwitches.rotate.defaultValue, false)
    assert.equal(editModeSwitches.scale.defaultValue, false)
    assert.equal(editModeSwitches.transform.ref.value, transformVisible.value)
    assert.equal(editModeSwitches.rotate.ref.value, rotateVisible.value)
    assert.equal(editModeSwitches.scale.ref.value, scaleVisible.value)
  })
})
