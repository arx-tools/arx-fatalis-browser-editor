import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createHistory, HISTORY_DEPTH, type HistoryCommand } from '../../../../src/editor/modules/history/history.ts'
import { createDeleteFacesRecord } from '../../../../src/editor/modules/history/records.ts'

/**
 * A step of the test that marks what happened, so the order and the halves can be checked.
 */
interface Step {
  readonly command: HistoryCommand
  /**
   * What the step did, in order: `apply` and `revert`.
   */
  readonly done: string[]
}

/**
 * Builds a step whose two halves leave a mark.
 *
 * @param name What the step is called, and what it writes into its list.
 *
 * @returns The command and the list of what it did.
 */
function step(name: string): Step {
  const done: string[] = []

  return {
    done,
    command: {
      label: name,
      record: createDeleteFacesRecord([1]),
      apply: (): void => {
        done.push(`${name}:apply`)
      },
      revert: (): void => {
        done.push(`${name}:revert`)
      },
    },
  }
}

void describe('createHistory', () => {
  void it('starts empty, both ways', () => {
    const history = createHistory()

    assert.equal(history.canUndo.value, false)
    assert.equal(history.canRedo.value, false)
  })

  void it('runs a step and keeps it', () => {
    const history = createHistory()
    const one = step('one')

    history.run(one.command)

    assert.deepEqual(one.done, ['one:apply'])
    assert.equal(history.canUndo.value, true)
    assert.equal(history.canRedo.value, false)
  })

  void it('takes the last step back, and puts it on the redo side', () => {
    const history = createHistory()
    const one = step('one')

    history.run(one.command)
    history.undo()

    assert.deepEqual(one.done, ['one:apply', 'one:revert'])
    assert.equal(history.canUndo.value, false)
    assert.equal(history.canRedo.value, true)
  })

  void it('makes an undone step again', () => {
    const history = createHistory()
    const one = step('one')

    history.run(one.command)
    history.undo()
    history.redo()

    assert.deepEqual(one.done, ['one:apply', 'one:revert', 'one:apply'])
    assert.equal(history.canUndo.value, true)
    assert.equal(history.canRedo.value, false)
  })

  void it('takes the steps back in the reverse order', () => {
    const history = createHistory()
    const one = step('one')
    const two = step('two')

    history.run(one.command)
    history.run(two.command)
    history.undo()
    history.undo()

    assert.deepEqual(two.done, ['two:apply', 'two:revert'])
    assert.deepEqual(one.done, ['one:apply', 'one:revert'])
    assert.equal(history.canUndo.value, false)
    assert.equal(history.canRedo.value, true)
  })

  void it('drops the undone steps when a new one comes', () => {
    const history = createHistory()
    const one = step('one')
    const two = step('two')

    history.run(one.command)
    history.undo()
    history.run(two.command)

    assert.equal(history.canRedo.value, false)
    assert.equal(history.undoStack.value.length, 1)
  })

  void it('keeps the depth, and drops the oldest step', () => {
    const history = createHistory()
    const steps = Array.from({ length: HISTORY_DEPTH + 5 }, (_, index) => {
      return step(`step-${String(index)}`)
    })

    for (const one of steps) {
      history.run(one.command)
    }

    assert.equal(history.undoStack.value.length, HISTORY_DEPTH)
    // the oldest five fell out, so the first one that can be taken back is the sixth
    assert.equal(history.undoStack.value[0]?.label, 'step-5')
  })

  void it('does nothing on an empty stack', () => {
    const history = createHistory()

    history.undo()
    history.redo()

    assert.equal(history.canUndo.value, false)
    assert.equal(history.canRedo.value, false)
  })

  void it('drops every step on clear', () => {
    const history = createHistory()

    history.run(step('one').command)
    history.undo()
    history.clear()

    assert.equal(history.canUndo.value, false)
    assert.equal(history.canRedo.value, false)
    assert.deepEqual(history.undoStack.value, [])
    assert.deepEqual(history.redoStack.value, [])
  })
})
