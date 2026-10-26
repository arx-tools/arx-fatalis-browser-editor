import type { Widget } from '@lumino/widgets'

/**
 * The kind of every widget the shell created, so the layout can be saved and the picker can tell
 * which kinds are already on the dock.
 */
const kinds = new WeakMap<Widget, string>()

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
