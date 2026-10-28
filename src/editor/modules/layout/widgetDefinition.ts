import type { Widget } from '@lumino/widgets'

/**
 * The kind of every widget the shell created, so the layout can be saved and the picker can tell
 * which kinds are already on the dock.
 */
const kinds = new WeakMap<Widget, string>()

/**
 * The category of a widget in the picker.
 *
 * @remarks
 * The categories are what the popup groups its rows by: what **draws** the level (`rendering`), what
 * **drives** the view (`controls`) and what only **shows** something about the level (`info`).
 */
export type WidgetGroup = 'controls' | 'info' | 'rendering'

/**
 * One category of the picker.
 */
export interface WidgetGroupDescription {
  /**
   * The identifier of the category.
   */
  readonly id: WidgetGroup
  /**
   * The name shown above the rows of the category.
   */
  readonly label: string
}

/**
 * The categories of the picker, in the order the popup shows them.
 */
export const widgetGroups: readonly WidgetGroupDescription[] = [
  { id: 'rendering', label: 'Rendering' },
  { id: 'controls', label: 'Controls' },
  { id: 'info', label: 'Info' },
]

/**
 * Everything the shell needs to know about one widget kind.
 */
export interface WidgetDefinition {
  /**
   * A stable identifier, also used as the `data-picker-kind` attribute of the picker rows.
   */
  readonly kind: string
  /**
   * The name of the widget: the overlay, the picker and the hotkey table all use this.
   */
  readonly label: string
  /**
   * The category the picker lists the widget under.
   */
  readonly group: WidgetGroup
  /**
   * Creates a new, unparented widget of the kind.
   */
  readonly create: () => Widget
}

/**
 * Creates a widget of the given kind, sets its title label and remembers its kind.
 *
 * @param definition The widget kind to create.
 *
 * @returns A new, unparented widget.
 */
export function createWidget(definition: WidgetDefinition): Widget {
  const widget = definition.create()
  widget.title.label = definition.label
  widget.node.dataset.widget = definition.label
  widget.node.dataset.widgetKind = definition.kind
  kinds.set(widget, definition.kind)

  return widget
}

/**
 * Tells the kind of a widget the shell created.
 *
 * @param widget The widget to look up.
 *
 * @returns The kind, or `undefined` when the widget was not created by {@link createWidget}.
 */
export function widgetKind(widget: Widget): string | undefined {
  return kinds.get(widget)
}
