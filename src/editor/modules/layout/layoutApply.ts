import { DockLayout, type DockPanel, type Widget } from '@lumino/widgets'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH, planLayout, type WidgetFit } from './contentFit.ts'
import { dockWidgets } from './dockWidgets.ts'
import {
  collectKinds,
  lockedBoxOf,
  lockWidgetTo,
  toDockConfig,
  toLayoutNode,
  type LayoutNode,
  type LockBox,
} from './layoutNode.ts'
import { defaultLayout } from './layoutPresets.ts'
import { createWidget, widgetKind, type WidgetDefinition } from './widgetDefinition.ts'

/**
 * The managed layout of the dock: the sizes, the locks and the rebuild of the tree.
 *
 * @remarks
 * This is the half of the shell that puts a layout tree on the dock. It is a factory of its own (a **context** in, a
 * small interface out) so the lock logic can be tested without a Vue app and without a shell: the pieces it needs from
 * the shell are the dock, the host element, the widget registry and four callbacks.
 *
 * A rebuild of the dock is a `restoreLayout` of lumino, which fires `layoutModified` — the dock echoes the change back
 * to the caller. The flag `isRebuilding` and the tree of the last pass (`appliedTree`) are what tell the caller that an
 * echo is not a change of the user.
 */

/**
 * What the applied layout needs from the shell.
 */
export interface LayoutApplyContext {
  /**
   * The dock of the shell.
   */
  readonly dock: DockPanel
  /**
   * The element the dock is attached to: the size of the layout is read from it.
   */
  readonly host: HTMLElement
  /**
   * The widget kinds the shell can put on the dock.
   */
  readonly definitions: readonly WidgetDefinition[]
  /**
   * Puts the edit mode decoration on a widget.
   *
   * @param widget The widget to decorate.
   */
  readonly decorate: (widget: Widget) => void
  /**
   * Takes the edit mode decoration off a widget.
   *
   * @param widget The widget to undecorate.
   */
  readonly undecorate: (widget: Widget) => void
  /**
   * Tells whether a border is being dragged right now.
   *
   * @returns True while the pointer is on a border with the button pressed.
   */
  readonly isDragActive: () => boolean
  /**
   * Hands the live tree of the dock to the shell (the persisted layout, the preset name).
   */
  readonly syncLayout: () => void
}

/**
 * The managed layout of a shell.
 */
export interface LayoutApply {
  /**
   * Creates the widgets of a tree, decorates them and rebuilds the dock from them.
   *
   * @param node The tree to build.
   * @param fallback `false` when the default layout is already being applied (no second fallback).
   */
  applyLayout: (node: LayoutNode, fallback?: boolean) => void
  /**
   * Works out the size of every child of the dock and rebuilds the dock from it.
   */
  applyManagedSizes: () => void
  /**
   * Asks for the sizes to be worked out again on the next frame.
   */
  requestManagedSizes: () => void
  /**
   * The tree the last pass applied, or `null` before the first one.
   */
  readonly appliedTree: LayoutNode | null
  /**
   * Whether the dock is being rebuilt from a tree of ours (the pass, a preset, the first layout).
   */
  readonly isRebuilding: boolean
}

/**
 * Builds the managed layout of the shell.
 *
 * @param context What the layout reads from the shell.
 *
 * @returns The operations the shell binds.
 */
export function createLayoutApply(context: LayoutApplyContext): LayoutApply {
  const { dock, host, definitions, decorate, undecorate, isDragActive, syncLayout } = context

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
    if (isDragActive()) {
      return
    }

    const { layout } = dock

    if (!(layout instanceof DockLayout)) {
      return
    }

    const tree = toLayoutNode(layout.saveLayout(), widgetKind)

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

    appliedTree = toLayoutNode(dock.saveLayout(), widgetKind)
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
    for (const widget of dockWidgets(dock)) {
      undecorate(widget)
      widget.dispose()
    }

    const widgets = new Map<string, Widget>()

    for (const kind of collectKinds(node)) {
      const definition = definitions.find((candidate) => {
        return candidate.kind === kind
      })

      if (definition === undefined) {
        continue
      }

      const widget = createWidget(definition)
      decorate(widget)
      widgets.set(kind, widget)
    }

    const config = toDockConfig(node, (kind) => {
      return widgets.get(kind)
    })

    const main = config?.main

    if (main === null || main === undefined) {
      for (const widget of widgets.values()) {
        undecorate(widget)
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
    appliedTree = toLayoutNode(dock.saveLayout(), widgetKind)

    // a widget that ended up nowhere (the tree changed under it) is thrown away, not left alive
    const live = dockWidgets(dock)

    for (const widget of widgets.values()) {
      if (!live.includes(widget)) {
        undecorate(widget)
        widget.dispose()
      }
    }

    syncLayout()

    // the dock has just been laid out from the weights of the tree, which is close but not the same thing: a lock is
    // a pixel size and a ratio a share of what the locks leave, and the content limits of the widgets are not in the
    // weights at all. The pass is what puts the sizes the preset asks for on the screen
    requestManagedSizes()
  }

  return {
    applyLayout,
    applyManagedSizes,
    requestManagedSizes,
    get appliedTree(): LayoutNode | null {
      return appliedTree
    },
    get isRebuilding(): boolean {
      return isRebuilding
    },
  }
}
