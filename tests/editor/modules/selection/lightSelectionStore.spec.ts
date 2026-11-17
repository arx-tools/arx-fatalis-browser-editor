import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLightSelectionStore } from '../../../../src/editor/modules/selection/lightSelectionStore.ts'

void describe('createLightSelectionStore', () => {
  void it('starts with no light selected', () => {
    const store = createLightSelectionStore()

    assert.equal(store.lights.value.size, 0)
    assert.equal(store.count.value, 0)
  })

  void it('keeps only one light with selectOnly', () => {
    const store = createLightSelectionStore()

    store.selectOnly(3)
    store.selectOnly(7)

    assert.deepEqual([...store.lights.value], [7])
  })

  void it('adds and removes a light', () => {
    const store = createLightSelectionStore()

    store.add(2)
    store.add(5)
    store.add(2)
    assert.deepEqual(
      [...store.lights.value].toSorted((one, other) => {
        return one - other
      }),
      [2, 5],
    )

    store.remove(2)
    assert.deepEqual([...store.lights.value], [5])

    store.remove(9)
    assert.deepEqual([...store.lights.value], [5])
  })

  void it('replaces the selection with selectMany', () => {
    const store = createLightSelectionStore()

    store.selectMany([1, 2], 'replace')
    assert.deepEqual(
      [...store.lights.value].toSorted((one, other) => {
        return one - other
      }),
      [1, 2],
    )

    store.selectMany([4], 'replace')
    assert.deepEqual([...store.lights.value], [4])
  })

  void it('adds and removes a group with selectMany', () => {
    const store = createLightSelectionStore()

    store.selectMany([1, 2], 'add')
    store.selectMany([2, 3], 'add')
    assert.deepEqual(
      [...store.lights.value].toSorted((one, other) => {
        return one - other
      }),
      [1, 2, 3],
    )

    store.selectMany([1, 3], 'remove')
    assert.deepEqual([...store.lights.value], [2])
  })

  void it('clears the selection', () => {
    const store = createLightSelectionStore()

    store.selectMany([1, 2, 3], 'replace')
    store.clear()

    assert.equal(store.lights.value.size, 0)
  })
})
