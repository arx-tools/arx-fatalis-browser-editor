import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { helpSections } from '../../../../../src/editor/components/widgets/KeyboardShortcutsWidget/helpRows.ts'
import { keyboardActions } from '../../../../../src/editor/modules/keyboard/actions.ts'

/**
 * The actions the rows of the help name.
 *
 * @returns The ids of the actions a row stands for.
 */
function listedActionIds(): Set<string> {
  const ids = new Set<string>()

  for (const section of helpSections) {
    for (const row of section.rows) {
      if (row.actionId !== undefined) {
        ids.add(row.actionId)
      }
    }
  }

  return ids
}

void describe('the rows of the key help', () => {
  void it('lists every action which has a key', () => {
    const listed = listedActionIds()
    const missing = keyboardActions
      .filter((action) => {
        return action.keys.length > 0 && !listed.has(action.id)
      })
      .map((action) => {
        return action.id
      })

    // a row names its action, and the caps come from the bindings: an action without a row would be a key the help
    // does not show, which is the drift the central list is for
    assert.deepStrictEqual(missing, [])
  })

  void it('leaves the actions without a key out', () => {
    const listed = listedActionIds()
    const withRow = keyboardActions
      .filter((action) => {
        return action.keys.length === 0 && listed.has(action.id)
      })
      .map((action) => {
        return action.id
      })

    // a row of a key that is not there has nothing to show: the help is the list of the keys
    assert.deepStrictEqual(withRow, [])
  })

  void it('names only actions of the table', () => {
    const known = new Set<string>(
      keyboardActions.map((action) => {
        return action.id
      }),
    )
    const unknown = [...listedActionIds()].filter((id) => {
      return !known.has(id)
    })

    assert.deepStrictEqual(unknown, [])
  })

  void it('gives every row keys or an action', () => {
    const empty: string[] = []

    for (const section of helpSections) {
      for (const row of section.rows) {
        if (row.actionId === undefined && (row.keys ?? []).length === 0) {
          empty.push(row.action)
        }
      }
    }

    assert.deepStrictEqual(empty, [])
  })
})
