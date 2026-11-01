import { DockLayout, DockPanel, Widget } from '@lumino/widgets'
import { computed, ref, shallowRef, type ComputedRef, type Ref } from 'vue'
import { watchBorderDrag, type BorderDragWatcher } from '../layout/borderDrag.ts'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH, planLayout, type WidgetFit } from '../layout/contentFit.ts'
import { dockWidgets } from '../layout/dockWidgets.ts'
import {
  CUSTOM_PRESET_LABEL,
  defaultLayout,
  factoryPreset,
  factoryPresets,
  type PresetId,
} from '../layout/layoutPresets.ts'
import { LayoutEditor, type MountWidgetOverlay } from '../layout/layoutEditor.ts'
import {
  collectKinds,
  layoutEquals,
  lockedBoxOf,
  lockWidgetTo,
  parseLayoutNode,
  type LockBox,
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
   * The tree the last pass of the sizes applied, or `null` before the first one.
   *
   * @remarks
   * The dock tells the world about its own rebuild as well (a message of the pass reaches the handler a frame later),
   * so the handler compares what the dock has with what the pass has just put there: the same tree means the message
   * is the echo of the pass and nothing of the user changed.
   */
  let appliedTree: LayoutNode | null = null

  /**
   * Tells whether the dock is being rebuilt from a tree of ours (the pass, a preset, the first layout).
   */
  let isRebuilding = false

  /**
   * The frame the next pass waits for, or `undefined` when none is asked for.
   */
  let sizesFrame: number | undefined

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
  /**
   * Writes the locks of a layout tree onto the widgets.
   *
   * @remarks
   * A lock lives on the node of the widget, and the widgets of a rebuilt dock are new: the tree is what remembers the
   * locks between two runs, so it is read back here. A widget that is not in a fixed size of the tree is not locked,
   * so a layout that comes from the storage or from a preset can not keep a lock of an earlier one.
   *
   * @param node The tree the dock was built from.
   */
  function applyLocks(node: LayoutNode): void {
    /**
     * Walks the tree, writing the box of every locked widget onto its node.
     *
     * @remarks
     * The two sides of a lock live on two levels of the tree: the width of a column is the size of the split that
     * holds it (a locked widget inside a vertical split fixes the width of that split, because the split can not grow
     * past what its children may take), and the height of the widget is its own size in that split. Walking down and
     * carrying the two sides is what puts the box back together after a reload.
     *
     * @param current The node to walk.
     * @param box The sides the ancestors have already fixed.
     */
    function collect(current: LayoutNode, box: LockBox): void {
      if (current.type === 'widget') {
        const widget = dockWidgets(dock).find((candidate) => {
          return widgetKind(candidate) === current.kind
        })

        if (widget !== undefined && box.width > 0 && box.height > 0) {
          lockWidgetTo(widget, box)
        }

        return
      }

      for (const [index, child] of current.children.entries()) {
        const size = current.sizes[index]
        let fixed: number | undefined

        if (size?.kind === 'fixed') {
          fixed = size.px
        }

        let next: LockBox = { width: box.width, height: box.height }

        if (fixed !== undefined && current.orientation === 'horizontal') {
          next = { width: fixed, height: box.height }
        } else if (fixed !== undefined) {
          next = { width: box.width, height: fixed }
        }

        collect(child, next)
      }
    }

    collect(node, { width: 0, height: 0 })
  }

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

    isRebuilding = true

    try {
      dock.restoreLayout({ main })
    } finally {
      isRebuilding = false
    }

    applyLocks(node)

    // the echo of this rebuild is not a change of the user either: without this the locks of the tree would be
    // overwritten by the sizes of the preset before the first pass of the sizes has applied them
    appliedTree = toLayoutNode(dock.saveLayout(), kindOf)

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
   * Puts a preset on the dock.
   *
   * @param id The preset to apply: a factory one, or the stored custom layout.
   */
  function applyPreset(id: string): void {
    const layout = factoryPreset(id)?.layout ?? customLayout.value

    if (layout === undefined) {
      return
    }

    applyLayout(layout)
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

  applyLayout(storedLayout.value)

  /**
   * Measures the height the content of a widget wants.
   *
   * @remarks
   * The measure is taken with the content element off its box for the length of it: the element fills the widget with
   * `height: 100%`, so without this its own height would be what it already got, and the widget could never grow or
   * shrink again.
   *
   * @param widget The live widget, when the dock has it.
   * @param kind The kind of the widget.
   *
   * @returns The height of its rows, or `undefined` for a view and for a widget that is not on the dock.
   */
  function contentHeightOf(widget: Widget | undefined, kind: string): number | undefined {
    if (widget === undefined) {
      return undefined
    }

    const definition = definitions.find((candidate) => {
      return candidate.kind === kind
    })

    if (definition?.contentSized !== true) {
      return undefined
    }

    const content = widget.node.querySelector<HTMLElement>('.VueWidget-content')

    if (content === null) {
      return undefined
    }

    const previous = content.style.height
    content.style.height = 'auto'
    const height = content.scrollHeight
    content.style.height = previous

    return Math.max(MIN_WIDGET_HEIGHT, height)
  }

  /**
   * Reads the limits of a widget: the height its content wants, the box it is locked to, and the floor of the css.
   *
   * @remarks
   * The three sources of a limit are the same as in a flexbox. The **content** is the natural height of a list (a view
   * has none: a canvas fills what it gets). The **lock** is what the user pinned: both sides of the box, so the widget
   * keeps the width it had as well. The **floor** is {@link MIN_WIDGET_HEIGHT} and {@link MIN_WIDGET_WIDTH}: below
   * that the splitter could not be grabbed.
   *
   * @param kind The kind of the widget.
   *
   * @returns What the layout may do with it, per axis.
   */
  function fitOf(kind: string): WidgetFit {
    const widget = dockWidgets(dock).find((candidate) => {
      return widgetKind(candidate) === kind
    })
    let box: LockBox | undefined

    if (widget !== undefined) {
      box = lockedBoxOf(widget)
    }

    return {
      width: { min: MIN_WIDGET_WIDTH, floor: MIN_WIDGET_WIDTH, max: box?.width ?? Number.POSITIVE_INFINITY },
      height: {
        min: contentHeightOf(widget, kind) ?? MIN_WIDGET_HEIGHT,
        floor: MIN_WIDGET_HEIGHT,
        max: box?.height ?? Number.POSITIVE_INFINITY,
      },
    }
  }

  /**
   * Works out the size of every child of the dock and builds the dock from it.
   *
   * @remarks
   * This is the **managed** layout: lumino keeps a slot at the size the shares give it and only clamps the node into
   * it, so a widget pinned with a css `max-height` would leave a hole in its column instead of handing the space to
   * its neighbours. Instead, the sizes are worked out for the whole tree (`planLayout`), where a lock is the maximum
   * of a child, and the dock is rebuilt from those sizes. A lock therefore keeps its box, the flexible widgets share
   * the rest by their ratios, and everything shrinks when the window has no room — no hole and no overflow.
   */
  function applyManagedSizes(): void {
    // a drag of a border holds the handle the pointer is on: a rebuild of the dock now would take the drag away, so the
    // drag itself corrects the sizes of the locked widgets, and the pass runs when it ends
    if (borderDrag.watcher?.isActive() === true) {
      return
    }

    const { layout } = dock

    if (!(layout instanceof DockLayout)) {
      return
    }

    const tree = toLayoutNode(layout.saveLayout(), kindOf)

    if (tree === null) {
      return
    }

    const box = host.getBoundingClientRect()

    if (box.width <= 0 || box.height <= 0) {
      return
    }

    const sizes = planLayout(tree, { width: box.width, height: box.height }, fitOf, dock.spacing)
    const widgets = new Map<string, Widget>()

    for (const widget of dockWidgets(dock)) {
      const kind = widgetKind(widget)

      if (kind !== undefined) {
        widgets.set(kind, widget)
      }
    }

    const config = toDockConfig(
      tree,
      (kind) => {
        return widgets.get(kind)
      },
      sizes,
    )

    if (config?.main === null || config?.main === undefined) {
      return
    }

    isRebuilding = true

    try {
      dock.restoreLayout({ main: config.main })
    } finally {
      isRebuilding = false
    }

    appliedTree = toLayoutNode(dock.saveLayout(), kindOf)
  }

  /**
   * Asks for the sizes to be worked out again on the next frame.
   *
   * @remarks
   * This is the way of a **resize**: the dock has to follow the window at once, and the window is not something the
   * user is dragging inside the dock, so a frame later is fine.
   */
  function requestManagedSizes(): void {
    if (sizesFrame !== undefined) {
      return
    }

    sizesFrame = requestAnimationFrame(() => {
      sizesFrame = undefined
      applyManagedSizes()
    })
  }

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

      applyManagedSizes()
    }, 250)
  }

  dock.layoutModified.connect(() => {
    const tree = toLayoutNode(dock.saveLayout(), kindOf)

    // the dock echoes a rebuild of the pass: that is not a change of the user
    if (isRebuilding || (tree !== null && appliedTree !== null && layoutEquals(tree, appliedTree))) {
      return
    }

    syncLayout()
    requestManagedSizesAfterDrag()
  })

  afterLockChanged = (): void => {
    // a lock is a fixed size in the tree, so the whole layout is worked out again from it
    applyManagedSizes()
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
      requestManagedSizes()
    },
  })

  const resizeObserver = new ResizeObserver(() => {
    requestManagedSizes()
    dock.fit()
  })
  resizeObserver.observe(host)

  document.addEventListener('keydown', handleKeyDown)

  // the first layout pass: the widgets get their real size here (after the browser laid the host out)
  const firstFit = requestAnimationFrame(() => {
    applyManagedSizes()
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
