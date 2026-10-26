import { DockPanel, Widget } from '@lumino/widgets'
import { dockWidgets } from '../layout/dockWidgets.ts'
import { createWidget, type WidgetDefinition } from '../layout/widgetDefinition.ts'

/**
 * The handle of a running shell: the dock itself plus the operations the header and the picker need.
 */
export interface EditorShell {
  /**
   * The dock panel the widgets live in.
   */
  readonly dock: DockPanel
  /**
   * Creates a widget of the kind and puts it into the dock.
   *
   * @param kind The identifier of the widget kind.
   * @param options Where the widget goes (a lumino insertion mode and a reference widget).
   *
   * @returns The new widget.
   */
  addWidget: (kind: string, options?: DockPanel.IAddOptions) => Widget
  /**
   * Disposes the widgets and the dock, so a hot reload does not leave a live shell behind.
   */
  dispose: () => void
}

/**
 * Builds the dock of the shell and puts the starting layout into it.
 *
 * @remarks
 * - lumino only inserts its own node into the host: sizing it is the host's job (the `.Dock` rule of
 * `components/Dock.vue` puts it on `inset: 0`)
 * - every size change of the host has to refit the layout, which is what the resize observer does
 *
 * @param host The element the dock is attached to.
 * @param definitions The widget kinds the shell can put on the dock. The shell has no registry of its
 * own: the caller passes it, so a test can pass plain widgets instead of the real (vue) widgets.
 *
 * @returns The handle of the shell.
 */
export function createEditorShell(host: HTMLElement, definitions: readonly WidgetDefinition[]): EditorShell {
  const dock = new DockPanel()
  dock.spacing = 4

  // `Widget.attach` puts the node into the host and fits it to the host size
  Widget.attach(dock, host)

  /**
   * Creates a widget of the kind and puts it into the dock.
   *
   * @param kind The identifier of the widget kind.
   * @param options Where the widget goes (a lumino insertion mode and a reference widget).
   *
   * @returns The new widget.
   *
   * @throws When the kind is not in the widget registry.
   */
  function addWidget(kind: string, options?: DockPanel.IAddOptions): Widget {
    const definition = definitions.find((candidate) => {
      return candidate.kind === kind
    })

    if (definition === undefined) {
      throw new Error(`Unknown widget kind: ${kind}`)
    }

    const widget = createWidget(definition)
    dock.addWidget(widget, options)

    return widget
  }

  // the starting layout: the 3D view on the left, the statistics above the help on the right
  const statistics = addWidget('statistics')
  addWidget('view3d', { mode: 'split-left', ref: null })
  addWidget('help', { mode: 'split-bottom', ref: statistics })

  const resizeObserver = new ResizeObserver(() => {
    dock.fit()
  })
  resizeObserver.observe(host)

  // the first layout pass: the widgets get their real size here (after the browser laid the host out)
  const firstFit = requestAnimationFrame(() => {
    dock.fit()
  })

  return {
    dock,
    addWidget,
    dispose: (): void => {
      cancelAnimationFrame(firstFit)
      resizeObserver.disconnect()

      // `DockLayout` does not dispose its children (only `PanelLayout` does), so the widgets go first:
      // their Vue apps have to be unmounted
      for (const widget of dockWidgets(dock)) {
        widget.dispose()
      }

      dock.dispose()
    },
  }
}
