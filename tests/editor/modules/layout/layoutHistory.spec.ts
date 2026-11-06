import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { customLayout, factoryPresets } from '../../../../src/editor/modules/layout/layoutPresets.ts'
import {
  canRedoOf,
  canUndoOf,
  createLayoutHistory,
  historyOf,
  parseLayoutHistories,
  redoOf,
  stateOf,
  undoOf,
  withHistory,
  withLayoutState,
} from '../../../../src/editor/modules/layout/layoutHistory.ts'
import { emptyLayout, flexSizes, type LayoutNode } from '../../../../src/editor/modules/layout/layoutNode.ts'

/**
 * A layout of the test: two widgets one under the other.
 *
 * @param ratio The share of the first one.
 *
 * @returns The tree.
 */
function column(ratio: number): LayoutNode {
  return {
    type: 'split',
    orientation: 'vertical',
    sizes: flexSizes(ratio, 1 - ratio),
    children: [
      { type: 'widget', kind: 'keyboard-shortcuts' },
      { type: 'widget', kind: 'camera-controls' },
    ],
  }
}

void describe('the history of a layout', () => {
  void it('starts on its only state, with no step to take', () => {
    const history = createLayoutHistory(column(0.5))

    assert.equal(history.states.length, 1)
    assert.equal(history.index, 0)
    assert.equal(canUndoOf(history), false)
    assert.equal(canRedoOf(history), false)
    assert.deepEqual(stateOf(history), column(0.5))
  })

  void it('puts a new tree on the end and moves with it', () => {
    const history = withLayoutState(createLayoutHistory(column(0.5)), column(0.7))

    assert.equal(history.states.length, 2)
    assert.equal(history.index, 1)
    assert.equal(canUndoOf(history), true)
    assert.equal(canRedoOf(history), false)
    assert.deepEqual(stateOf(history), column(0.7))
  })

  void it('does not keep a tree the layout already has', () => {
    const start = createLayoutHistory(column(0.5))
    const history = withLayoutState(start, column(0.5))

    assert.equal(history, start)
  })

  void it('drops the redo side when a new tweak comes after a step back', () => {
    const two = withLayoutState(createLayoutHistory(column(0.5)), column(0.7))
    const three = withLayoutState(two, column(0.9))
    const back = undoOf(three)

    assert.deepEqual(stateOf(back), column(0.7))

    const next = withLayoutState(back, column(0.3))

    // the state the step back left on stays, and the one it took back (0.9) is gone: the new step took its place
    assert.equal(next.states.length, 3)
    assert.equal(next.index, 2)
    assert.equal(canRedoOf(next), false)
    assert.deepEqual(stateOf(next), column(0.3))
  })

  void it('steps back and again, and stops at the ends', () => {
    const start = createLayoutHistory(column(0.5))
    const two = withLayoutState(start, column(0.7))
    const back = undoOf(two)

    assert.deepEqual(stateOf(back), column(0.5))
    assert.equal(undoOf(back), back)

    const again = redoOf(back)

    assert.deepEqual(stateOf(again), column(0.7))
    assert.equal(redoOf(again), again)
  })

  void it('keeps the last forty states, the cursor moving with the oldest one', () => {
    let history = createLayoutHistory(column(0))

    for (let step = 1; step <= 50; step = step + 1) {
      history = withLayoutState(history, column(step / 100))
    }

    assert.equal(history.states.length, 40)
    assert.equal(history.index, 39)
    // the oldest states fell off: the first one is the eleventh step, and the newest is the last
    assert.deepEqual(stateOf(history), column(0.5))
    assert.deepEqual(history.states[0], column(0.11))
  })
})

void describe('the histories of the presets', () => {
  void it('gives a preset without a history its factory tree', () => {
    const viewer = factoryPresets.find((preset) => {
      return preset.id === 'viewer'
    })

    const history = historyOf({}, 'viewer')

    assert.equal(history.states.length, 1)
    assert.deepEqual(stateOf(history), viewer?.layout)
  })

  void it('keeps the histories of the other presets', () => {
    const viewerHistory = createLayoutHistory(column(0.5))
    const histories = withHistory({}, 'viewer', viewerHistory)

    assert.deepEqual(historyOf(histories, 'viewer'), viewerHistory)
    assert.equal(historyOf(histories, 'editor').states.length, 1)
  })

  void it('reads the stored histories back', () => {
    const histories = parseLayoutHistories(
      JSON.stringify({
        viewer: { states: [column(0.5), column(0.7)], index: 1 },
      }),
    )

    assert.deepEqual(histories?.viewer, { states: [column(0.5), column(0.7)], index: 1 })
  })

  void it('gives nothing for a value that is not a history', () => {
    assert.equal(parseLayoutHistories('not json at all'), undefined)
    assert.equal(parseLayoutHistories('[]'), undefined)
    assert.equal(parseLayoutHistories('{"viewer": "nothing"}'), undefined)
    assert.equal(parseLayoutHistories('{"viewer": {"states": [], "index": 0}}'), undefined)
    assert.equal(parseLayoutHistories('{"viewer": {"states": [{"type": "widget"}], "index": 0}}'), undefined)
    assert.equal(
      parseLayoutHistories('{"viewer": {"states": [{"type": "widget", "kind": "a"}], "index": 3}}'),
      undefined,
    )
  })

  void it('drops a preset the storage knows but this build does not', () => {
    const histories = parseLayoutHistories(JSON.stringify({ nonsense: { states: [column(0.5)], index: 0 } }))

    assert.deepEqual(histories, {})
  })

  void it('starts the custom layout from the empty dock, and the first widget is its first step', () => {
    const start = historyOf({}, 'custom')

    assert.equal(start.states.length, 1)
    assert.deepEqual(stateOf(start), emptyLayout)
    assert.deepEqual(customLayout, emptyLayout)

    const withOne = withLayoutState(start, { type: 'widget', kind: '3d-view' })

    assert.equal(canUndoOf(withOne), true)
    assert.deepEqual(stateOf(undoOf(withOne)), emptyLayout)

    const again = redoOf(undoOf(withOne))

    assert.deepEqual(stateOf(again), { type: 'widget', kind: '3d-view' })
  })

  void it('reads the stored history of the empty layout back', () => {
    const histories = parseLayoutHistories(
      JSON.stringify({
        custom: { states: [emptyLayout, { type: 'widget', kind: '3d-view' }], index: 0 },
      }),
    )

    assert.deepEqual(histories?.custom, { states: [emptyLayout, { type: 'widget', kind: '3d-view' }], index: 0 })
  })
})
