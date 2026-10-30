import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { createSelectionStore, selectionStore } from '../../../../src/editor/modules/selection/selectionStore.ts'

beforeEach(() => {
  selectionStore.clear()
})

void describe('createSelectionStore', () => {
  void it('starts empty', () => {
    const store = createSelectionStore()

    assert.equal(store.count.value, 0)
    assert.equal(store.polygons.value.size, 0)
  })

  void it('keeps only the polygon of a new selection', () => {
    const store = createSelectionStore()

    store.add(1)
    store.add(2)
    store.selectOnly(3)

    assert.deepEqual([...store.polygons.value], [3])
    assert.equal(store.count.value, 1)
  })

  void it('adds a polygon once', () => {
    const store = createSelectionStore()

    store.add(1)
    store.add(2)
    store.add(1)

    assert.equal(store.count.value, 2)
  })

  void it('removes a polygon, and ignores one that is not selected', () => {
    const store = createSelectionStore()

    store.add(1)
    store.add(2)
    store.remove(1)
    store.remove(5)

    assert.deepEqual([...store.polygons.value], [2])
  })

  void it('counts a quad as one polygon', () => {
    // the store holds polygon indices, not triangles: a quad is one index, even though the mesh has two
    // triangles for it
    const store = createSelectionStore()

    store.add(7)

    assert.equal(store.count.value, 1)
  })

  void it('empties the selection', () => {
    const store = createSelectionStore()

    store.add(1)
    store.clear()

    assert.equal(store.count.value, 0)
  })

  void it('replaces the set, so a watcher sees the change', () => {
    const store = createSelectionStore()

    store.add(1)
    const before = store.polygons.value
    store.add(2)

    assert.notEqual(store.polygons.value, before)
    assert.equal(store.count.value, 2)
  })
})
