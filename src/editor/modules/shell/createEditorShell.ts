import { DockLayout, DockPanel, Widget } from '@lumino/widgets'
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { watchBorderDrag, type BorderDragWatcher } from '../layout/borderDrag/drag.ts'
import { dockWidgets } from '../layout/dockWidgets.ts'
import { createLayoutApply } from '../layout/layoutApply.ts'
import {
  CUSTOM_PRESET_LABEL,
  defaultLayout,
  factoryPreset,
  factoryPresets,
  type PresetId,
} from '../layout/layoutPresets.ts'
import { LayoutEditor, type MountWidgetOverlay } from '../layout/layoutEditor.ts'
import { layoutEquals, parseLayoutNode, toLayoutNode, type LayoutNode } from '../layout/layoutNode.ts'
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
   * Tells whether the live layout is not the selected factory preset: a modified layout is the custom one.
   */
  readonly isLayoutModified: ComputedRef<boolean>
  /**
   * The presets the header offers: the factory ones and, once there is one, the custom slot at the end.
   */
  readonly presets: ComputedRef<readonly PresetOption[]>
  /**
   * The preset the dropdown shows as selected.
   */
  readonly selectedPreset: ComputedRef<PresetId>
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
   * Puts a preset on the dock.
   *
   * @param id The preset to apply: a factory one, or the stored custom layout.
   */
  applyPreset: (id: string) => void
  /**
   * Disposes the widgets and the dock, so a hot reload does not leave a live shell behind.
   */
  dispose: () => void
}

/**
 * One row of the preset dropdown of the header.
 */
export interface PresetOption {
  /**
   * The identifier the dropdown selects it by.
   */
  readonly id: PresetId
  /**
   * The name shown in the dropdown.
   */
  readonly label: string
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

  // the editor is built before the layout functions are written: the lock reaches them through this, and it is
  // called at click time, when everything is in place
  /**
   * What happens after a widget was locked, until the layout functions are written.
   */
  function afterLockChangedPlaceholder(): void {
    // the editor is built before the layout functions are: nothing to do until then
  }

  let afterLockChanged: () => void = afterLockChangedPlaceholder

  /**
   * The watcher of the border drags, or `undefined` before it is built.
   *
   * @remarks
   * The pass must not run while a border is dragged — a rebuild takes the handle away from under the pointer — so the
   * watcher is asked first, and the drag itself corrects the sizes of the locked widgets by hand. The watcher is built
   * after the functions it calls, so the field is filled later.
   */
  const borderDrag: { watcher?: BorderDragWatcher } = {}

  /**
   * The timer that waits for a drag to end, or `undefined` when none is running.
   */
  let sizesTimer: ReturnType<typeof setTimeout> | undefined

  const editor = new LayoutEditor(dock, host, mountOverlay, (): void => {
    afterLockChanged()
  })
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

  /**
   * The custom slot: the last layout that is not a factory preset.
   *
   * @remarks
   * It is the one level of history of the layout: a change of a factory preset lands here, and the header
   * offers it back as the `Custom` entry. It is stored, so the dropdown keeps it after a reload.
   */
  const customLayout = persistedRef<LayoutNode | undefined>({
    key: 'layoutCustom',
    defaultValue: undefined,
    persistInLocalStorage: true,
    debounce: 250,
    deserialize: readLayout,
  })

  // the live tree: it follows the dock synchronously, while the ref above writes it out debounced
  const currentLayout = shallowRef<LayoutNode>(storedLayout.value)

  /**
   * The preset the header shows as selected.
   *
   * @remarks
   * It is derived from the live layout: the dropdown follows the dock, so a preset that is dragged back to
   * its own tree selects itself again, and a tree that is not a factory one is the custom slot.
   */
  const selectedPreset = computed<PresetId>(() => {
    const found = factoryPresets.find((preset) => {
      return layoutEquals(preset.layout, currentLayout.value)
    })

    return found?.id ?? 'custom'
  })

  const isLayoutModified = computed(() => {
    return selectedPreset.value === 'custom'
  })

  const presets = computed<readonly PresetOption[]>(() => {
    const options = factoryPresets.map((preset): PresetOption => {
      return { id: preset.id, label: preset.label }
    })

    if (customLayout.value === undefined) {
      return options
    }

    return [...options, { id: 'custom', label: CUSTOM_PRESET_LABEL }]
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

    // a tree that is not a factory preset is the custom one: the change of the user overwrites the previous
    // custom layout, while a preset only fills the dock and leaves the slot alone
    if (
      factoryPresets.every((preset) => {
        return !layoutEquals(preset.layout, node)
      })
    ) {
      customLayout.value = node
    }

    currentLayout.value = node
    storedLayout.value = node
    refreshPlacedKinds()
  }

  /**
   * The managed layout of the dock: the sizes, the locks and the rebuild of the tree.
   *
   * @remarks
   * The pass has its own module (`layout/layoutApply.ts`), so the lock logic is a unit of its own: this is where the
   * shell binds it to the dock, the host, the widget registry and the edits of the tree.
   */
  const apply = createLayoutApply({
    dock,
    host,
    definitions,
    decorate: (widget) => {
      editor.decorate(widget)
    },
    undecorate: (widget) => {
      editor.undecorate(widget)
    },
    isDragActive: () => {
      return borderDrag.watcher?.isActive() === true
    },
    syncLayout,
  })

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
   * Puts a preset on the dock.
   *
   * @param id The preset to apply: a factory one, or the stored custom layout.
   */
  function applyPreset(id: string): void {
    const layout = factoryPreset(id)?.layout ?? customLayout.value

    if (layout === undefined) {
      return
    }

    apply.applyLayout(layout)
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

  // the starting layout: the stored one, or the default when there is nothing usable in the storage. The
  // custom slot has to be there before the dock is filled, because `syncLayout` only writes a tree that is
  // not a factory preset into it
  if (
    customLayout.value === undefined &&
    factoryPresets.every((preset) => {
      return !layoutEquals(preset.layout, storedLayout.value)
    })
  ) {
    customLayout.value = storedLayout.value
  }

  apply.applyLayout(storedLayout.value)

  /**
   * Asks for the sizes to be worked out when the user stops dragging a border.
   *
   * @remarks
   * The pass **rebuilds** the dock, and a rebuild in the middle of a drag takes the handle away from under the pointer:
   * the drag would stop after the first pixel, and the layout would jump back to where it was. So a change that comes
   * from a drag waits for the drag to end — a quarter of a second without a change — and only the last position of the
   * border is applied.
   */
  function requestManagedSizesAfterDrag(): void {
    if (sizesTimer !== undefined) {
      clearTimeout(sizesTimer)
    }

    sizesTimer = setTimeout(() => {
      sizesTimer = undefined

      apply.applyManagedSizes()
    }, 250)
  }

  dock.layoutModified.connect(() => {
    const tree = toLayoutNode(dock.saveLayout(), kindOf)

    // the dock echoes a rebuild of the pass: that is not a change of the user
    if (apply.isRebuilding || (tree !== null && apply.appliedTree !== null && layoutEquals(tree, apply.appliedTree))) {
      return
    }

    syncLayout()
    requestManagedSizesAfterDrag()
  })

  afterLockChanged = (): void => {
    // a lock is a fixed size in the tree, so the whole layout is worked out again from it
    apply.applyManagedSizes()
    syncLayout()
  }

  borderDrag.watcher = watchBorderDrag(host, {
    tree: () => {
      const { layout } = dock

      if (!(layout instanceof DockLayout)) {
        return null
      }

      return toLayoutNode(layout.saveLayout(), kindOf)
    },
    widgets: () => {
      return dockWidgets(dock)
    },
    spacing: dock.spacing,
    onEnded: () => {
      // the lock of the widgets was written by the watcher: the tree has to be read again, and the sizes of the whole
      // dock are worked out from the (possibly new) locks
      syncLayout()
      apply.requestManagedSizes()
    },
  })

  const resizeObserver = new ResizeObserver(() => {
    apply.requestManagedSizes()
    dock.fit()
  })
  resizeObserver.observe(host)

  document.addEventListener('keydown', handleKeyDown)

  // the first layout pass: the widgets get their real size here (after the browser laid the host out)
  const firstFit = requestAnimationFrame(() => {
    apply.applyManagedSizes()
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
    presets,
    selectedPreset,
    setEditing,
    setPickerOpen: (open: boolean): void => {
      pickerOpen.value = open
    },
    addWidget,
    removeWidgetByKind,
    applyPreset,
    dispose: (): void => {
      cancelAnimationFrame(firstFit)
      resizeObserver.disconnect()
      document.removeEventListener('keydown', handleKeyDown)
      dock.layoutModified.disconnect(syncLayout)
      borderDrag.watcher?.dispose()
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
