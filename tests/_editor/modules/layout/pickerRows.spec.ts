import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Widget } from '@lumino/widgets'
import type { WidgetDefinition } from '../../../../src/_editor/modules/layout/widgetDefinition.ts'
import { pickerRows } from '../../../../src/_editor/modules/layout/pickerRows.ts'

/**
 * A definition whose factory fails: the pure function only reads the id and the name.
 *
 * @param id The stable identifier the registry uses.
 * @param name The text shown on the row.
 *
 * @returns The kind the picker offers.
 */
function definition(id: string, name: string): WidgetDefinition {
  return {
    kind: id,
    label: name,
    create: (): Widget => {
      assert.fail('the picker rows must not create a widget')
    },
  }
}

/**
 * The widget kinds of the test.
 */
const definitions: WidgetDefinition[] = [
  definition('view3d', '3D View'),
  definition('statistics', 'Statistics'),
  definition('help', 'Help'),
]

void describe('pickerRows', () => {
  void it('marks the kinds that are on the dock', () => {
    const rows = pickerRows(definitions, ['statistics'])

    assert.deepEqual(
      rows.map((row) => {
        let state = 'free'

        if (row.isPlaced) {
          state = 'placed'
        }

        return `${row.kind}:${state}`
      }),
      ['view3d:free', 'statistics:placed', 'help:free'],
    )
  })

  void it('keeps the label of the definition', () => {
    assert.deepEqual(
      pickerRows(definitions, []).map((row) => {
        return row.label
      }),
      ['3D View', 'Statistics', 'Help'],
    )
  })

  void it('gives a free row for every kind of an empty dock', () => {
    assert.ok(
      pickerRows(definitions, []).every((row) => {
        return !row.isPlaced
      }),
    )
  })

  void it('ignores a placed kind that is not offered', () => {
    const rows = pickerRows(definitions, ['camera'])

    assert.ok(
      rows.every((row) => {
        return !row.isPlaced
      }),
    )
  })

  void it('keeps the order of the definitions', () => {
    assert.deepEqual(
      pickerRows(definitions, ['help', 'view3d']).map((row) => {
        return row.kind
      }),
      ['view3d', 'statistics', 'help'],
    )
  })
})
