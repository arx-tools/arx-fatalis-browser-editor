import { DockLayout, DockPanel, Widget } from '@lumino/widgets'
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { dockWidgets } from '../layout/dockWidgets.ts'
import { defaultLayout } from '../layout/layoutPresets.ts'
import { LayoutEditor, type MountWidgetOverlay } from '../layout/layoutEditor.ts'
import {
  collectKinds,
  layoutEquals,
  parseLayoutNode,
  toDockConfig,
  toLayoutNode,
  type LayoutNode,
} from '../layout/layoutNode.ts'
import { createWidget, widgetKind, type WidgetDefinition } from '../layout/widgetDefinition.ts'
import { persistedRef } from '../persistedRef/persistedRef.ts'

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
   * Tells whether the layout differs from {@link defaultLayout}: the reset button is shown when it does.
   */
  readonly isLayoutModified: ComputedRef<boolean>
  /**
   * The layout editor of the dock.
   */
  readonly editor: LayoutEditor
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
   * Throws the current layout away and restores the default one.
   */
  resetLayout: () => void
  /**
   * Disposes the widgets and the dock, so a hot reload does not leave a live shell behind.
   */
  dispose: () => void
}

/**
 * Reads the stored layout of the dock.
 *
 * @remarks
 * The storage may hold garbage (an older shape, a hand edited value), so the value is validated: an
 * unreadable layout is not an error, it just means the default one is used.
 *
 * @param raw The raw value of the storage.
 *
 * @returns The tree, or `undefined` when the value is not a layout.
 */
function readLayout(raw: string): LayoutNode | undefined {
  try {
    const parsed: unknown = JSON.parse(raw)

    return parseLayoutNode(parsed) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Builds the dock of the shell and puts the stored (or the default) layout into it.
 *
 * @remarks
 * - lumino only inserts its own node into the host: sizing it is the host's job (the `.Dock` rule of
 * `components/Dock.vue` puts it on `inset: 0`)
 * - every size change of the host has to refit the layout, which is what the resize observer does
 * - `Escape` leaves the edit mode; the drag of a widget handles its own `Escape` earlier, so the two
 * do not fire for the same press
 * - the layout is persisted in the `localStorage` under the `layout` key through a `persistedRef`: the
 * lumino config itself is not serializable (its tab areas carry widget instances), so the stored form
 * is the `LayoutNode` tree
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

  /**
   * Reads the kind of a live widget.
   *
   * @param widget The widget to read.
   *
   * @returns The kind, or `undefined` for a widget that did not come from this shell.
   */
  function kindOf(widget: Widget): string | undefined {
    return widgetKind(widget)
  }

  /**
   * The stored layout: the default one until the user changes something.
   *
   * The write is debounced, because a split drag emits a layout change on every mouse move.
   */
  const storedLayout = persistedRef<LayoutNode>({
    key: 'layout',
    defaultValue: defaultLayout,
    persistInLocalStorage: true,
    debounce: 250,
    deserialize: readLayout,
  })

  // the live tree: it follows the dock synchronously, while the ref above writes it out debounced
  const currentLayout = shallowRef<LayoutNode>(storedLayout.value)
  const isLayoutModified = computed(() => {
    return !layoutEquals(currentLayout.value, defaultLayout)
  })

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

  /**
   * Reads the live tree of the dock into the reactive value and hands it to the persisted ref.
   */
  function syncLayout(): void {
    const { layout } = dock

    if (!(layout instanceof DockLayout)) {
      return
    }

    const node = toLayoutNode(layout.saveLayout(), kindOf)

    if (node === null) {
      return
    }

    currentLayout.value = node
    storedLayout.value = node
    refreshPlacedKinds()
  }

  /**
   * Empties the dock: the overlays are unmounted and the widgets are disposed, so their Vue apps go too.
   */
  function clearDock(): void {
    for (const widget of dockWidgets(dock)) {
      editor.undecorate(widget)
      widget.dispose()
    }
  }

  /**
   * Creates the widgets of the tree, decorates them for the edit mode and rebuilds the dock from them.
   *
   * @remarks
   * A kind that is no longer in the registry is dropped with its share; when nothing is left, the
   * default layout takes over, so the screen is never empty.
   *
   * @param node The tree to build.
   * @param fallback `false` when the default layout is already being applied (no second fallback).
   */
  function applyLayout(node: LayoutNode, fallback = true): void {
    clearDock()

    const widgets = new Map<string, Widget>()

    for (const kind of collectKinds(node)) {
      const definition = definitions.find((candidate) => {
        return candidate.kind === kind
      })

      if (definition === undefined) {
        continue
      }

      const widget = createWidget(definition)
      editor.decorate(widget)
      widgets.set(kind, widget)
    }

    const config = toDockConfig(node, (kind) => {
      return widgets.get(kind)
    })

    const main = config?.main

    if (main === null || main === undefined) {
      for (const widget of widgets.values()) {
        editor.undecorate(widget)
        widget.dispose()
      }

      if (fallback) {
        applyLayout(defaultLayout, false)
      }

      return
    }

    dock.restoreLayout({ main })

    // a widget that ended up nowhere (the tree changed under it) is thrown away, not left alive
    const live = dockWidgets(dock)

    for (const widget of widgets.values()) {
      if (!live.includes(widget)) {
        editor.undecorate(widget)
        widget.dispose()
      }
    }

    syncLayout()
  }

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

    // a new widget never lands in a tab area: lumino's default mode is `tab-after`, which would hide the
    // widget behind a tab (and the layout tree could not store it), so the default is a new column
    dock.addWidget(widget, options ?? { mode: 'split-right', ref: null })
    syncLayout()

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
      syncLayout()
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

  /**
   * Throws the current layout away and restores the default one.
   */
  function resetLayout(): void {
    storedLayout.reset()
    applyLayout(defaultLayout)
  }

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

  // the starting layout: the stored one, or the default when there is nothing usable in the storage
  applyLayout(storedLayout.value)
  dock.layoutModified.connect(syncLayout)

  const resizeObserver = new ResizeObserver(() => {
    dock.fit()
  })
  resizeObserver.observe(host)

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
    isLayoutModified,
    setEditing,
    setPickerOpen: (open: boolean): void => {
      pickerOpen.value = open
    },
    addWidget,
    removeWidgetByKind,
    resetLayout,
    dispose: (): void => {
      cancelAnimationFrame(firstFit)
      resizeObserver.disconnect()
      document.removeEventListener('keydown', handleKeyDown)
      dock.layoutModified.disconnect(syncLayout)
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
