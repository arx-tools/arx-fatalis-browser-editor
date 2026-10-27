import { DockPanel, Widget } from '@lumino/widgets'
import { ref, type Ref } from 'vue'
import { dockWidgets } from '../layout/dockWidgets.ts'
import { LayoutEditor, type MountWidgetOverlay } from '../layout/layoutEditor.ts'
import { createWidget, widgetKind, type WidgetDefinition } from '../layout/widgetDefinition.ts'

/**
 * The handle of a running shell: the dock itself plus the operations the header and the picker need.
 */
export interface EditorShell {
  /**
   * The element the dock is attached to: the drop area of a drag.
   */
  readonly host: HTMLElement
  /**
   * The dock panel the widgets live in.
   */
  readonly dock: DockPanel
  /**
   * The widget kinds the shell can put on the dock.
   */
  readonly definitions: readonly WidgetDefinition[]
  /**
   * The kinds that are currently on the dock. It is reactive, so the picker follows the dock.
   */
  readonly placedKinds: Ref<readonly string[]>
  /**
   * The layout editor of the dock.
   */
  readonly editor: LayoutEditor
  /**
   * Tells whether the layout edit mode is on (the open lock). It is reactive, so the lock button and
   * the escape key stay in sync.
   */
  readonly isEditing: Ref<boolean>
  /**
   * Tells whether the widget picker is open. It is reactive, so the manager and the escape key follow
   * it.
   */
  readonly pickerOpen: Ref<boolean>
  /**
   * Turns the edit mode on or off.
   *
   * @param editing `true` for edit mode (open lock), `false` for the normal, locked layout.
   */
  setEditing: (editing: boolean) => void
  /**
   * Opens or closes the widget picker.
   *
   * @param open `true` to open the popup, `false` to close it.
   */
  setPickerOpen: (open: boolean) => void
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
   * Removes the widget of a kind from the dock, exactly like the trash of its overlay does.
   *
   * @param kind The identifier of the widget kind.
   */
  removeWidgetByKind: (kind: string) => void
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
 * - `Escape` leaves the edit mode; the drag of a widget handles its own `Escape` earlier, so the two
 * do not fire for the same press
 *
 * @param host The element the dock is attached to.
 * @param definitions The widget kinds the shell can put on the dock. The shell has no registry of its
 * own: the caller passes it, so a test can pass plain widgets instead of the real (vue) widgets.
 * @param mountOverlay Mounts the overlay of the edit mode; the app passes the Vue component, a test
 * passes a stand-in, so this module has no `.vue` import either.
 *
 * @returns The handle of the shell.
 *
 * @throws When the kind is not in the widget registry.
 */
export function createEditorShell(
  host: HTMLElement,
  definitions: readonly WidgetDefinition[],
  mountOverlay: MountWidgetOverlay,
): EditorShell {
  const dock = new DockPanel()
  dock.spacing = 4

  // `Widget.attach` puts the node into the host and fits it to the host size
  Widget.attach(dock, host)

  const editor = new LayoutEditor(dock, host, mountOverlay)
  const isEditing = ref(false)
  const pickerOpen = ref(false)

  // the dock changes are lumino's, not vue's: the signal of the dock refreshes the reactive list
  const placedKinds = ref<readonly string[]>([])

  /**
   * Reads the kinds that are on the dock into the reactive list.
   */
  function refreshPlacedKinds(): void {
    placedKinds.value = dockWidgets(dock)
      .map((widget) => {
        return widgetKind(widget)
      })
      .filter((kind): kind is string => {
        return kind !== undefined
      })
  }

  dock.layoutModified.connect(refreshPlacedKinds)
  refreshPlacedKinds()

  /**
   * Creates a widget of the kind, decorates it for the edit mode and puts it into the dock.
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
    editor.decorate(widget)
    dock.addWidget(widget, options)
    refreshPlacedKinds()

    return widget
  }

  /**
   * Removes the widget of a kind from the dock.
   *
   * @param kind The identifier of the widget kind.
   */
  function removeWidgetByKind(kind: string): void {
    const widget = dockWidgets(dock).find((candidate) => {
      return widgetKind(candidate) === kind
    })

    if (widget !== undefined) {
      editor.removeWidget(widget)
      refreshPlacedKinds()
    }
  }

  /**
   * Turns the edit mode on or off.
   *
   * @param editing `true` for edit mode (open lock), `false` for the normal, locked layout.
   */
  function setEditing(editing: boolean): void {
    isEditing.value = editing
    editor.setUnlocked(editing)
  }

  // the starting layout: the 3D view on the left, the statistics above the help on the right
  const statistics = addWidget('statistics')
  addWidget('view3d', { mode: 'split-left', ref: null })
  addWidget('help', { mode: 'split-bottom', ref: statistics })

  const resizeObserver = new ResizeObserver(() => {
    dock.fit()
  })
  resizeObserver.observe(host)

  /**
   * Handles the escape key: the popup closes first, the edit mode only after that.
   *
   * @param event The keydown event of the document.
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return
    }

    if (pickerOpen.value) {
      pickerOpen.value = false
      return
    }

    if (isEditing.value) {
      setEditing(false)
    }
  }

  document.addEventListener('keydown', handleKeyDown)

  // the first layout pass: the widgets get their real size here (after the browser laid the host out)
  const firstFit = requestAnimationFrame(() => {
    dock.fit()
  })

  return {
    host,
    dock,
    definitions,
    placedKinds,
    editor,
    isEditing,
    pickerOpen,
    setEditing,
    setPickerOpen: (open: boolean): void => {
      pickerOpen.value = open
    },
    addWidget,
    removeWidgetByKind,
    dispose: (): void => {
      cancelAnimationFrame(firstFit)
      resizeObserver.disconnect()
      document.removeEventListener('keydown', handleKeyDown)
      setEditing(false)
      pickerOpen.value = false
      editor.dispose()

      // `DockLayout` does not dispose its children (only `PanelLayout` does), so the widgets go first:
      // their Vue apps have to be unmounted
      for (const widget of dockWidgets(dock)) {
        widget.dispose()
      }

      dock.dispose()
    },
  }
}
