import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createCrosshairStore } from '../../../../src/editor/modules/crosshair/crosshairStore.ts'

void describe('createCrosshairStore', () => {
  void it('starts with nothing under the crosshair', () => {
    const store = createCrosshairStore()

    assert.equal(store.polygon.value, undefined)
  })

  void it('reports the polygon the crosshair is on', () => {
    const store = createCrosshairStore()

    store.set(12)

    assert.equal(store.polygon.value, 12)
  })

  void it('drops the polygon when the ray hits nothing', () => {
    const store = createCrosshairStore()

    store.set(12)
    store.set(undefined)

    assert.equal(store.polygon.value, undefined)
  })
})
