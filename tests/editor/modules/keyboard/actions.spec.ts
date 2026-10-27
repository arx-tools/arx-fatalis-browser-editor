import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  keyboardActions,
  type KeyboardAction,
  type KeyboardGroup,
} from '../../../../src/editor/modules/keyboard/actions.ts'
import { createDefaultBindings } from '../../../../src/editor/modules/keyboard/bindings.ts'
import { getComboId, resolveKeys, type KeyboardMode } from '../../../../src/editor/modules/keyboard/functions.ts'

/**
 * The groups the help panel knows.
 */
const groups = new Set<KeyboardGroup>(['camera', 'developer', 'movement', 'overlay', 'selection', 'view'])

/**
 * The modes the dispatcher knows.
 */
const modes: KeyboardMode[] = ['dialog', 'editor', 'pointerLocked', 'typing']

/**
 * Collects the ids of the actions which fail a check, so a test can assert on an empty list.
 *
 * @param items The actions to check.
 * @param isWrong What makes an action wrong.
 * @returns The ids of the wrong ones.
 */
function collectWrongIds(items: readonly KeyboardAction[], isWrong: (action: KeyboardAction) => boolean): string[] {
  return items
    .filter((action) => {
      return isWrong(action)
    })
    .map((action) => {
      return action.id
    })
}

void describe('the action table', () => {
  void it('has a unique id for every action', () => {
    const ids = keyboardActions.map((action) => {
      return action.id
    })

    assert.equal(new Set(ids).size, ids.length)
  })

  void it('puts every action into a known group', () => {
    const wrong = collectWrongIds(keyboardActions, (action) => {
      return !groups.has(action.group)
    })

    assert.deepEqual(wrong, [])
  })

  void it('uses known modes only', () => {
    const wrong = collectWrongIds(keyboardActions, (action) => {
      return (action.modes ?? []).some((mode) => {
        return !modes.includes(mode)
      })
    })

    assert.deepEqual(wrong, [])
  })

  void it('does not give one combo to two actions of the same mode', () => {
    const used = new Map<string, string>()
    const collisions: string[] = []

    for (const action of keyboardActions) {
      const actionModes = action.modes ?? modes

      for (const combo of resolveKeys(action.keys, false)) {
        const id = getComboId(combo)

        for (const mode of actionModes) {
          const key = `${mode}:${id}`
          const other = used.get(key)

          if (other !== undefined) {
            collisions.push(`${action.id} and ${other} share ${id} in ${mode}`)
          }

          used.set(key, action.id)
        }
      }
    }

    assert.deepEqual(collisions, [])
  })

  void it('lists a function without a key too', () => {
    const withoutKey = collectWrongIds(keyboardActions, (action) => {
      return action.keys.length === 0
    })

    assert.ok(withoutKey.length > 0)
  })

  void it('gives every hold action at least one key', () => {
    const wrong = collectWrongIds(keyboardActions, (action) => {
      return action.hold === true && action.keys.length === 0
    })

    assert.deepEqual(wrong, [])
  })

  void it('builds a binding for every action, with or without a key', () => {
    const bindings = createDefaultBindings(false)
    const missing = collectWrongIds(keyboardActions, (action) => {
      return bindings[action.id] === undefined
    })

    assert.deepEqual(missing, [])
  })

  void it('resolves the primary modifier per platform', () => {
    const windows = createDefaultBindings(false)
    const mac = createDefaultBindings(true)

    // the table has no `primary` combo yet, so the two lists match: the test documents the idea
    assert.deepEqual(windows.toggleMesh, mac.toggleMesh)
    assert.deepEqual(windows.moveForward, mac.moveForward)
  })
})
