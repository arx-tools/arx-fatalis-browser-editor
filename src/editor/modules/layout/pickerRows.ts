import { widgetGroups, type WidgetDefinition, type WidgetGroup } from './widgetDefinition.ts'

/**
 * One row of the widget picker.
 */
export interface PickerRow {
  /**
   * The identifier of the widget kind the row offers.
   */
  readonly kind: string
  /**
   * The name shown on the row.
   */
  readonly label: string
  /**
   * Tells whether the kind is already on the dock. A placed row gets the trash instead of the grip.
   */
  readonly isPlaced: boolean
}

/**
 * One category of the picker: the heading and the rows below it.
 */
export interface PickerGroup {
  /**
   * The identifier of the category.
   */
  readonly group: WidgetGroup
  /**
   * The name shown above the rows.
   */
  readonly label: string
  /**
   * The rows of the category, in the order of the definitions.
   */
  readonly rows: readonly PickerRow[]
}

/**
 * Builds the grouped rows of the widget picker.
 *
 * @remarks
 * - a widget kind exists at most once on the dock, so a row has two states: a placed kind is not
 * draggable (it only offers the trash), a free one can be dragged in
 * - the categories come in the order of {@link widgetGroups}, and a category with no widget is left
 * out, so the popup never shows an empty heading
 * - the computation is pure, so it is tested without a browser; the component only renders the result
 *
 * @param definitions The widget kinds the shell offers.
 * @param placedKinds The kinds that are currently on the dock.
 *
 * @returns One entry per category that has at least one widget.
 */
export function pickerRows(definitions: readonly WidgetDefinition[], placedKinds: readonly string[]): PickerGroup[] {
  const placed = new Set(placedKinds)

  return widgetGroups.flatMap((category) => {
    const rows = definitions
      .filter((definition) => {
        return definition.group === category.id
      })
      .map((definition) => {
        return { kind: definition.kind, label: definition.label, isPlaced: placed.has(definition.kind) }
      })

    if (rows.length === 0) {
      return []
    }

    return [{ group: category.id, label: category.label, rows }]
  })
}
