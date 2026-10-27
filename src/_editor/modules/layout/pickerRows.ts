import type { WidgetDefinition } from './widgetDefinition.ts'

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
 * Builds the rows of the widget picker.
 *
 * @remarks
 * A widget kind exists at most once on the dock, so a row has two states: a placed kind is not
 * draggable (it only offers the trash), a free one can be dragged in. The computation is pure, so it
 * is tested without a browser; the component only renders the result.
 *
 * @param definitions The widget kinds the shell offers.
 * @param placedKinds The kinds that are currently on the dock.
 *
 * @returns One row per definition, in the order of the definitions.
 */
export function pickerRows(definitions: readonly WidgetDefinition[], placedKinds: readonly string[]): PickerRow[] {
  const placed = new Set(placedKinds)

  return definitions.map((definition) => {
    return { kind: definition.kind, label: definition.label, isPlaced: placed.has(definition.kind) }
  })
}
