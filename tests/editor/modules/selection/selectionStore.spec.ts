import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import {
  createSelectionStore,
  selectionModeOf,
  selectionStore,
} from '../../../../src/editor/modules/selection/selectionStore.ts'

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

void describe('selectionModeOf', () => {
  void it('starts a new selection on a plain click', () => {
    assert.equal(selectionModeOf({ shiftKey: false, ctrlKey: false, metaKey: false }), 'replace')
  })

  void it('adds on shift', () => {
    assert.equal(selectionModeOf({ shiftKey: true, ctrlKey: false, metaKey: false }), 'add')
  })

  void it('removes on ctrl, and on meta too', () => {
    assert.equal(selectionModeOf({ shiftKey: false, ctrlKey: true, metaKey: false }), 'remove')
    assert.equal(selectionModeOf({ shiftKey: false, ctrlKey: false, metaKey: true }), 'remove')
  })

  void it('lets ctrl win over shift', () => {
    assert.equal(selectionModeOf({ shiftKey: true, ctrlKey: true, metaKey: false }), 'remove')
  })
})

void describe('selectMany', () => {
  void it('replaces the selection with a group', () => {
    const store = createSelectionStore()

    store.add(9)
    store.selectMany([1, 2, 3], 'replace')

    assert.deepEqual(
      [...store.polygons.value].toSorted((a, b) => {
        return a - b
      }),
      [1, 2, 3],
    )
  })

  void it('adds a group to the selection', () => {
    const store = createSelectionStore()

    store.add(9)
    store.selectMany([1, 2], 'add')

    assert.deepEqual(
      [...store.polygons.value].toSorted((a, b) => {
        return a - b
      }),
      [1, 2, 9],
    )
  })

  void it('takes a group out of the selection', () => {
    const store = createSelectionStore()

    store.selectMany([1, 2, 3], 'replace')
    store.selectMany([2, 3, 4], 'remove')

    assert.deepEqual([...store.polygons.value], [1])
  })
})
