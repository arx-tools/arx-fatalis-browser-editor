import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Widget } from '@lumino/widgets'
import type { WidgetDefinition, WidgetGroup } from '../../../../src/editor/modules/layout/widgetDefinition.ts'
import { pickerRows } from '../../../../src/editor/modules/layout/pickerRows.ts'

/**
 * A definition whose factory fails: the pure function only reads the id, the name and the category.
 *
 * @param id The stable identifier the registry uses.
 * @param name The text shown on the row.
 * @param group The category the popup lists it under.
 *
 * @returns The kind the picker offers.
 */
function definition(id: string, name: string, group: WidgetGroup): WidgetDefinition {
  return {
    kind: id,
    label: name,
    group,
    create: (): Widget => {
      assert.fail('the picker rows must not create a widget')
    },
  }
}

/**
 * The widget kinds of the test.
 */
const definitions: WidgetDefinition[] = [
  definition('view3d', '3D View', 'rendering'),
  definition('camera', 'Camera Controls', 'controls'),
  definition('statistics', 'Map Statistics', 'info'),
  definition('help', 'Controls', 'info'),
]

/**
 * Flattens the rows of the groups into one list, for the order assertions.
 *
 * @param groups The groups to flatten.
 *
 * @returns The kinds, in the order the popup shows them.
 */
function kindsOf(groups: ReturnType<typeof pickerRows>): string[] {
  return groups.flatMap((group) => {
    return group.rows.map((row) => {
      return row.kind
    })
  })
}

void describe('pickerRows', () => {
  void it('groups the kinds by their category, in the order of the categories', () => {
    assert.deepEqual(
      pickerRows(definitions, []).map((group) => {
        return group.label
      }),
      ['Rendering', 'Controls', 'Info'],
    )
  })

  void it('keeps the order of the definitions inside a category', () => {
    assert.deepEqual(kindsOf(pickerRows(definitions, [])), ['view3d', 'camera', 'statistics', 'help'])
  })

  void it('leaves out a category that has no widget', () => {
    const onlyRendering = [definition('view3d', '3D View', 'rendering')]

    assert.deepEqual(
      pickerRows(onlyRendering, []).map((group) => {
        return group.group
      }),
      ['rendering'],
    )
  })

  void it('marks the kinds that are on the dock', () => {
    const groups = pickerRows(definitions, ['statistics'])

    const marked = groups.flatMap((group) => {
      return group.rows
        .filter((row) => {
          return row.isPlaced
        })
        .map((row) => {
          return row.kind
        })
    })

    assert.deepEqual(marked, ['statistics'])
  })

  void it('keeps the label of the definition', () => {
    assert.deepEqual(
      pickerRows(definitions, []).map((group) => {
        return group.rows.map((row) => {
          return row.label
        })
      }),
      [['3D View'], ['Camera Controls'], ['Map Statistics', 'Controls']],
    )
  })

  void it('gives a free row for every kind of an empty dock', () => {
    const placed = pickerRows(definitions, []).flatMap((group) => {
      return group.rows.filter((row) => {
        return row.isPlaced
      })
    })

    assert.deepEqual(placed, [])
  })

  void it('ignores a placed kind that is not offered', () => {
    const placed = pickerRows(definitions, ['not-a-widget']).flatMap((group) => {
      return group.rows.filter((row) => {
        return row.isPlaced
      })
    })

    assert.deepEqual(placed, [])
  })

  void it('gives nothing for a registry without definitions', () => {
    assert.deepEqual(pickerRows([], ['view3d']), [])
  })
})
