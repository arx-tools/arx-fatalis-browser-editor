import { DockLayout, DockPanel, Widget } from '@lumino/widgets'
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { watchBorderDrag, type BorderDragWatcher } from '../layout/borderDrag/drag.ts'
import { dockWidgets } from '../layout/dockWidgets.ts'
import { toLayoutNode } from '../layout/dockConfig.ts'
import { createLayoutApply } from '../layout/layoutApply.ts'
import { factoryPreset, factoryPresets, type PresetId } from '../layout/layoutPresets.ts'
import {
  canRedoOf,
  canUndoOf,
  historyOf,
  parseLayoutHistories,
  redoOf,
  stateOf,
  undoOf,
  withHistory,
  withLayoutState,
  type LayoutHistories,
  type LayoutHistory,
} from '../layout/layoutHistory.ts'
import { LayoutEditor, type MountWidgetOverlay } from '../layout/layoutEditor.ts'
import { layoutEquals, lockedBoxOf, lockWidgetTo, type LayoutNode } from '../layout/layoutNode.ts'
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
   * The presets the header offers, with the steps their own history can take.
   */
  readonly presets: ComputedRef<readonly PresetOption[]>
  /**
   * The preset the dropdown shows as selected: the layout the dock is on.
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
   * Puts a preset on the dock, at the state its history is on.
   *
   * @param id The preset to apply.
   */
  applyPreset: (id: string) => void
  /**
   * Takes a layout one step back in its own history (a row that is not on the screen switches to it first).
   *
   * @param id The preset of the row the button belongs to.
   */
  undoPreset: (id: PresetId) => void
  /**
   * Makes the step of a layout again.
   *
   * @param id The preset of the row the button belongs to.
   */
  redoPreset: (id: PresetId) => void
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
  /**
   * Tells whether the layout has a step to take back.
   */
  readonly canUndo: boolean
  /**
   * Tells whether the layout has a step to make again.
   */
  readonly canRedo: boolean
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
   * The layout the dock is on: the preset the header shows, and the row the steps belong to.
   *
   * @remarks
   * It is **chosen**, not derived from the tree: a tweak belongs to the preset it started from, so the dropdown keeps
   * saying which layout the user is working on (the old model derived it, and a changed preset became `Custom`).
   */
  const activePreset = persistedRef<PresetId>({
    key: 'layoutPreset',
    defaultValue: 'viewer',
    persistInLocalStorage: true,
  })

  /**
   * The history of every layout: the states it went through, and where each one is.
   *
   * @remarks
   * A preset starts from its factory tree, and every tweak of the user is a state on top of it. The histories are kept
   * in the browser, so a reload brings back what each layout was left like. The keys of the browser (`Ctrl+Z`) belong
   * to the **map** history: a layout step is a button of the dropdown only.
   */
  const histories = persistedRef<LayoutHistories>({
    key: 'layoutHistories',
    defaultValue: {},
    persistInLocalStorage: true,
    debounce: 250,
    deserialize: parseLayoutHistories,
  })

  /**
   * Reads the history of a preset.
   *
   * @param id The preset to read.
   *
   * @returns The history of that preset.
   */
  function historyFor(id: PresetId): LayoutHistory {
    return historyOf(histories.value, id)
  }

  /**
   * Stores the history of a preset.
   *
   * @param id The preset the history belongs to.
   * @param history The history to store.
   */
  function saveHistory(id: PresetId, history: LayoutHistory): void {
    histories.value = withHistory(histories.value, id, history)
  }

  const selectedPreset = computed<PresetId>(() => {
    return activePreset.value
  })

  const presets = computed<readonly PresetOption[]>(() => {
    return factoryPresets.map((preset): PresetOption => {
      const history = historyFor(preset.id)

      return {
        id: preset.id,
        label: preset.label,
        canUndo: canUndoOf(history),
        canRedo: canRedoOf(history),
      }
    })
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
   * Reads the live tree of the dock.
   *
   * @remarks
   * The tree is what the dock has now, and the history of the active preset is what keeps it: the steps are written
   * where the pass of the sizes settles (see {@link recordLayout}).
   *
   * @returns The tree of the dock, or `undefined` when the dock has none.
   */
  function readDockLayout(): LayoutNode | undefined {
    const { layout } = dock

    if (!(layout instanceof DockLayout)) {
      return undefined
    }

    return toLayoutNode(layout.saveLayout(), kindOf) ?? undefined
  }

  /**
   * Reads the kinds of the dock and the tree of the layout.
   */
  function syncLayout(): void {
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
   * Writes the size a locked widget has now into its lock.
   *
   * @remarks
   * A change of the layout by the user (a widget dropped beside a locked one, a widget removed, a border dragged) is
   * **stronger** than a lock: the size it gave a locked widget becomes its new lock, the way a border drag writes its
   * end (`applyDragEdges`). Without this the pass of the sizes puts the old lock back a quarter of a second later, and
   * the widget that was just added beside it is squeezed to the leftover room. A widget whose box did not change keeps
   * the lock it had, so the pin of a column survives a change on the other side of the dock.
   */
  function refreshLocks(): void {
    for (const widget of dockWidgets(dock)) {
      const box = lockedBoxOf(widget)

      if (box === undefined) {
        continue
      }

      const rect = widget.node.getBoundingClientRect()
      const width = Math.round(rect.width)
      const height = Math.round(rect.height)

      if (width <= 0 || height <= 0 || (width === box.width && height === box.height)) {
        continue
      }

      lockWidgetTo(widget, { width, height })
    }
  }

  /**
   * Puts the tree of the dock on the history of the active preset.
   *
   * @remarks
   * A layout change of the user (a drop beside a locked widget, a removal, a border drag) is one step of the preset it
   * was made on. The step is written where the pass of the sizes has settled, so the sizes of the pass are what the
   * history keeps: a step back then puts the same pixels on the screen, and not the guesses the dock had during the
   * drag.
   */
  function recordLayout(): void {
    // the dock has the tree of the pass by now: the pass rebuilt it from the plan a moment ago
    const tree = readDockLayout()

    if (tree === undefined) {
      return
    }

    saveHistory(activePreset.value, withLayoutState(historyFor(activePreset.value), tree))
  }

  /**
   * Asks for the sizes to be worked out when the user stops dragging a border.
   *
   * @remarks
   * The pass **rebuilds** the dock, and a rebuild in the middle of a drag takes the handle away from under the pointer:
   * the drag would stop after the first pixel, and the layout would jump back to where it was. So a change that comes
   * from a drag waits for the drag to end — a quarter of a second without a change — and only the last position of the
   * border is applied.
   *
   * The wait is also where a **drop** settles: the new split is on the screen a moment after the widget was added, and
   * the locks are read from the boxes then (see {@link refreshLocks}), so the pass works the layout out from the sizes
   * the user just made instead of the sizes the preset pinned.
   */
  function requestManagedSizesAfterDrag(): void {
    if (sizesTimer !== undefined) {
      clearTimeout(sizesTimer)
    }

    sizesTimer = setTimeout(() => {
      sizesTimer = undefined

      // the sizes the dock settled on are the new locks, and the tree has to be read again before the pass works the
      // layout out from it: the boxes of a drop are only final once the browser laid the dock out (the signal of the
      // layout comes before that), so this is the place where the lock can follow the user
      refreshLocks()
      syncLayout()
      apply.applyManagedSizes()
      // the sizes of the pass are the step the history keeps: a step back puts the same pixels on the screen
      recordLayout()
    }, 250)
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
    // a widget of the user is a step of the layout: the pass that settles it is what the history keeps
    requestManagedSizesAfterDrag()

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
      requestManagedSizesAfterDrag()
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
   * Puts a preset on the dock, at the state its own history is on.
   *
   * @remarks
   * Switching **keeps every history**: a layout that was tweaked is left on its last state, and coming back puts that
   * state on the dock, with its cursor where it was.
   *
   * @param id The preset to apply.
   */
  function applyPreset(id: string): void {
    const preset = factoryPreset(id)

    if (preset === undefined) {
      return
    }

    activePreset.value = preset.id
    apply.applyLayout(stateOf(historyFor(preset.id)))
  }

  /**
   * Takes a layout one step back in its own history.
   *
   * @remarks
   * The steps of a row are **its own**: the menu shows the state of every layout (which one has a step to take), and a
   * step of a row that is not on the screen switches to it first, so the button does what it says.
   *
   * @param id The preset of the row.
   */
  function undoPreset(id: PresetId): void {
    const history = historyFor(id)

    if (!canUndoOf(history)) {
      return
    }

    const next = undoOf(history)

    activePreset.value = id
    saveHistory(id, next)
    apply.applyLayout(stateOf(next))
  }

  /**
   * Makes the step of a layout again.
   *
   * @param id The preset of the row (a row that is not on the screen switches to it first).
   */
  function redoPreset(id: PresetId): void {
    const history = historyFor(id)

    if (!canRedoOf(history)) {
      return
    }

    const next = redoOf(history)

    activePreset.value = id
    saveHistory(id, next)
    apply.applyLayout(stateOf(next))
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

  // the starting layout: the active preset at the state its history is on (its factory tree, when the browser has no
  // history for it yet). The old `layout`/`layoutCustom` keys are dropped by the owner's decision: a layout is started
  // from the presets, with its own history
  if (factoryPreset(activePreset.value) === undefined) {
    activePreset.value = 'viewer'
  }

  apply.applyLayout(stateOf(historyFor(activePreset.value)))

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
    // a lock is a fixed size in the tree, so the whole layout is worked out again from it — and it is a step of the
    // layout the user made, so the history keeps it (the echo of the pass is not seen as a change, the step is here)
    apply.applyManagedSizes()
    syncLayout()
    recordLayout()
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
    presets,
    selectedPreset,
    setEditing,
    setPickerOpen: (open: boolean): void => {
      pickerOpen.value = open
    },
    addWidget,
    removeWidgetByKind,
    applyPreset,
    undoPreset,
    redoPreset,
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
