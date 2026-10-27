import { DockLayout, type DockPanel, type Widget } from '@lumino/widgets'

/**
 * Lists the widgets of a dock panel.
 *
 * @remarks
 * `DockPanel.widgets` is inherited from `Panel` and reads `layout.widgets`, but `DockLayout.widgets`
 * is a *method*, not a getter: the getter hands back the function itself, so `Array.from(dock.widgets)`
 * is silently empty. The layout method is the one to call.
 *
 * @param dock The dock panel to list.
 *
 * @returns The widgets of the dock, in layout order.
 */
export function dockWidgets(dock: DockPanel): Widget[] {
  const { layout } = dock

  if (!(layout instanceof DockLayout)) {
    return []
  }

  return [...layout.widgets()]
}
