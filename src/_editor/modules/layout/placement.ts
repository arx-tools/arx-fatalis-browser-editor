/**
 * Gives the widget the promised share of the root split and rescales its siblings proportionally.
 *
 * @remarks
 * Lumino has no setter for the sizer sizes, so the layout is saved, the root sizes are rewritten and
 * the layout is restored; `restoreLayout` keeps the widget instances, only the tab bars are rebuilt.
 *
 * @param dock The dock the widget was just added to.
 * @param widget The widget whose share has to be set.
 * @param share The share of the dock the widget should take (0..1).
 */
import { DockLayout, type DockPanel, type Widget } from '@lumino/widgets'
import { ROOT_ZONE_SHARE, type DropTarget } from './hitTest.ts'

function normalizeRootShare(dock: DockPanel, widget: Widget, share: number): void {
  const { layout } = dock

  if (!(layout instanceof DockLayout)) {
    return
  }

  const config = layout.saveLayout()
  const { main } = config

  if (main?.type !== 'split-area') {
    return
  }

  const index = main.children.findIndex((child) => {
    return child.type === 'tab-area' && child.widgets.includes(widget)
  })

  if (index === -1) {
    return
  }

  const siblings = main.children.length - 1
  let rest = 0

  if (siblings > 0) {
    rest = (1 - share) / siblings
  }

  main.sizes = main.children.map((_, position) => {
    if (position === index) {
      return share
    }

    return rest
  })
  layout.restoreLayout(config)
}

/**
 * Puts a widget into the dock at a drop target.
 *
 * @remarks
 * - a drop next to a widget is one `addWidget` call: lumino moves the widget, splits the reference
 * area and reflows the freed space
 * - a drop on the edge of the dock (`ref: null`) becomes a root split, and its size is normalized
 * afterwards: lumino sizes a *wrapped* root with the golden ratio, but when the root already has the
 * orientation of the drop the new child gets a different share, so the result would be unpredictable
 * and the preview would lie
 *
 * @param dock The dock to add the widget to.
 * @param widget The widget to add.
 * @param target The drop target under the pointer, or `null` when the drag was cancelled.
 */
export function placeWidget(dock: DockPanel, widget: Widget, target: DropTarget | null): void {
  if (target === null) {
    return
  }

  dock.addWidget(widget, { mode: target.mode, ref: target.ref })

  if (target.ref === null && target.mode !== 'tab-after') {
    normalizeRootShare(dock, widget, ROOT_ZONE_SHARE)
  }
}
