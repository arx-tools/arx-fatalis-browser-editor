import { DockLayout, type DockPanel, type Widget } from '@lumino/widgets'
import { planLayout } from './contentFit/plan.ts'
import { MIN_WIDGET_HEIGHT, MIN_WIDGET_WIDTH, type WidgetFit } from './contentFit/split.ts'
import { toDockConfig, toLayoutNode } from './dockConfig.ts'
import { dockWidgets } from './dockWidgets.ts'
import {
  collectKinds,
  keptLockOf,
  lockedBoxOf,
  lockAxesOfKind,
  lockWidgetTo,
  type LayoutNode,
  type LockBox,
} from './layoutNode.ts'
import { defaultLayout, factoryPresets } from './layoutPresets.ts'
import { WIDGET_KINDS } from './widgetKinds.ts'
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
export type LayoutApplyContext = {
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
   * Mounts the overlays of the edit mode again, so their labels read the locks a preset has just written.
   */
  readonly refreshOverlays: () => void
  /**
   * Hands the live tree of the dock to the shell (the persisted layout, the preset name).
   */
  readonly syncLayout: () => void
}

/**
 * The managed layout of a shell.
 */
export type LayoutApply = {
  /**
   * Keeps the widgets the tree has a place for, creates the missing ones and rebuilds the dock from them.
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
   * Creates the fixed views of the factory presets, off the dock, so the first switch to a layout that has one does not
   * build it.
   */
  prepareWidgets: () => void
  /**
   * Disposes the widgets that are waiting off the dock, so a shell that goes away leaves no Vue app and no GL context
   * behind.
   */
  disposeReady: () => void
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
 * The kinds of the fixed views.
 *
 * @remarks
 * A fixed view builds a scene of the level (a renderer, the meshes of the level and their overlays), which is the cost
 * of a preset switch between two layouts with a different set of them (the lighter has the top, the left and the front,
 * the entities only the top). The kinds a factory preset uses are prepared at start, and any fixed view that comes off
 * the dock waits for the next layout that has it instead of being thrown away (TODO 281).
 */
const FIXED_VIEW_KINDS: ReadonlySet<string> = new Set([
  WIDGET_KINDS.topView,
  WIDGET_KINDS.bottomView,
  WIDGET_KINDS.frontView,
  WIDGET_KINDS.backView,
  WIDGET_KINDS.leftView,
  WIDGET_KINDS.rightView,
])

/**
 * The fixed views the factory presets use, in the order they first appear.
 *
 * @remarks
 * The bottom, back and right views are not in a factory preset, so they are not prepared: the author puts them on the
 * dock when they need them, and the first one is built then.
 */
const PREPARED_KINDS: readonly string[] = [
  ...new Set(
    factoryPresets.flatMap((preset) => {
      return collectKinds(preset.layout)
    }),
  ),
].filter((kind) => {
  return FIXED_VIEW_KINDS.has(kind)
})

/**
 * Builds the managed layout of the shell.
 *
 * @param context What the layout reads from the shell.
 *
 * @returns The operations the shell binds.
 */
export function createLayoutApply(context: LayoutApplyContext): LayoutApply {
  const { dock, host, definitions, decorate, undecorate, isDragActive, refreshOverlays, syncLayout } = context

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
   * The tree the dock was just rebuilt from, while the pass of its sizes is on its way.
   *
   * @remarks
   * The weights of a config are not the sizes of the tree: a flexible child is a **share of the space the locks
   * leave**, and lumino reads every weight as a share of the whole split. A tree with two flexible children of another
   * ratio (0.36 and 0.63) therefore reaches the dock as a few pixels next to a locked pixel size, lumino clamps both to
   * the css minimum, and the tree read back has them at 50-50. The pass has to work from the tree it put there, or the
   * collapsed ratios would be written into the layout as the new state — the undo of a dragged border then looked like a
   * redo (the owner's bug, 2026-11-09).
   */
  let pendingTree: LayoutNode | null = null

  /**
   * The widgets that came off the dock and wait for the next layout that has their kind.
   *
   * @remarks
   * A fixed view builds a scene of the level, so rebuilding it on every switch between two layouts that show a different
   * set of them is the lag of the presets (the lighter and the entities). A widget here is detached (lumino unparented
   * it) but alive: its Vue app, its renderer and its canvas are the ones the next layout gets. Only the fixed views are
   * kept: a form or a list is cheap to build and holds the state of the level it was opened on.
   */
  const readyWidgets = new Map<string, Widget>()

  /**
   * Takes a widget off the dock: a fixed view waits for the next layout, anything else is thrown away.
   *
   * @param widget The widget the new tree has no place for.
   */
  function retire(widget: Widget): void {
    undecorate(widget)
    lockWidgetTo(widget, undefined)

    const kind = widgetKind(widget)

    if (kind !== undefined && FIXED_VIEW_KINDS.has(kind)) {
      readyWidgets.set(kind, widget)

      return
    }

    widget.dispose()
  }

  /**
   * Creates the fixed views the factory presets use, off the dock, so the first switch to a layout that has one does not
   * build it.
   *
   * @remarks
   * The widgets are created without the decoration of the edit mode: a layout that takes one decorates it. The kinds
   * already on the dock (and the ones already waiting) are left alone.
   */
  function prepareWidgets(): void {
    const placed = new Set<string>()

    for (const widget of dockWidgets(dock)) {
      const kind = widgetKind(widget)

      if (kind !== undefined) {
        placed.add(kind)
      }
    }

    for (const kind of PREPARED_KINDS) {
      if (placed.has(kind) || readyWidgets.has(kind)) {
        continue
      }

      const definition = definitions.find((candidate) => {
        return candidate.kind === kind
      })

      if (definition === undefined) {
        continue
      }

      readyWidgets.set(kind, createWidget(definition))
    }
  }

  /**
   * Disposes the widgets that wait off the dock.
   */
  function disposeReady(): void {
    for (const widget of readyWidgets.values()) {
      widget.dispose()
    }

    readyWidgets.clear()
  }

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
   * its neighbors. Instead, the sizes are worked out for the whole tree (`planLayout`), where a lock is the maximum
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

    const tree = pendingTree ?? toLayoutNode(layout.saveLayout(), widgetKind)

    if (tree === null) {
      return
    }

    pendingTree = null

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
   * A widget node may carry its **own** box: the splits around it can only remember one side of the lock (the width
   * from the horizontal ancestor, the height from the vertical one), and a widget whose column collapsed has neither.
   * The box on the node is the whole lock, so it wins over what the walk inherited; a preset (which has no boxes on its
   * widgets) keeps reading the sides from the splits, the way it always did.
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
      // the empty layout has no widget to lock, and no side to carry down
      if (current.type === 'empty') {
        return
      }

      if (current.type === 'widget') {
        const widget = dockWidgets(dock).find((candidate) => {
          return widgetKind(candidate) === current.kind
        })

        if (widget === undefined) {
          return
        }

        // the sides the tree carries, cut to the axes the live dock has: a side with no split behind it is the dock's
        // own size, and keeping it would freeze the window, not the widget (2026-11-25, the owner)
        const kept = keptLockOf(
          lockAxesOfKind(node, current.kind),
          current.lock?.width ?? box.width,
          current.lock?.height ?? box.height,
        )

        if (kept !== undefined) {
          lockWidgetTo(widget, kept)
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

    collect(node, {})
  }

  /**
   * Takes every widget off the dock, so the empty layout of the `Custom` preset has a screen to be dropped onto.
   *
   * @remarks
   * An empty layout is not a config: `restoreLayout({ main: null })` is what lumino calls an unparented dock. The
   * restore unparents the widgets first, and the fixed views wait on the bench after it ({@link retire}), so the next
   * layout that has one does not build it again.
   */
  function clearDock(): void {
    pendingTree = null

    const previous = dockWidgets(dock)

    isRebuilding = true

    try {
      dock.restoreLayout({ main: null })
    } finally {
      isRebuilding = false
    }

    // the echo of this rebuild is not a change of the user (the `layoutModified` of the removed widgets arrives a
    // message later, when the flag above is already down)
    appliedTree = toLayoutNode(dock.saveLayout(), widgetKind)

    for (const widget of previous) {
      retire(widget)
    }

    syncLayout()
  }

  /**
   * Keeps the widgets the tree has a place for, creates the missing ones and rebuilds the dock from them.
   *
   * @remarks
   * The kinds of the tree decide what happens to the widgets that are already on the dock. A widget of a kind the tree
   * has is **kept**: a preset switch rearranges the dock instead of throwing the Vue apps away, so the walkable view
   * keeps its canvas, its camera and the pointer lock (TODO 281). A fixed view of a kind the tree has no place for is
   * unparented by the restore and waits on the bench for the next layout; any other widget of such a kind is disposed
   * below. A kind without a live widget is taken from the bench, or created and decorated.
   *
   * A kind that is no longer in the registry is dropped with its share; when nothing is left, the default layout takes
   * over, so the screen is never empty by accident. An **empty** tree is not an accident: it clears the dock and
   * leaves it bare, with the placeholder of the dock in the middle (`Dock.vue`) as the only thing on it.
   *
   * @param node The tree to build.
   * @param fallback `false` when the default layout is already being applied (no second fallback).
   */
  function applyLayout(node: LayoutNode, fallback = true): void {
    if (node.type === 'empty') {
      clearDock()

      return
    }

    const previous = dockWidgets(dock)
    const kept = new Map<string, Widget>()

    for (const widget of previous) {
      const kind = widgetKind(widget)

      if (kind !== undefined && !kept.has(kind)) {
        kept.set(kind, widget)
      }
    }

    const widgets = new Map<string, Widget>()

    for (const kind of collectKinds(node)) {
      const definition = definitions.find((candidate) => {
        return candidate.kind === kind
      })

      if (definition === undefined) {
        continue
      }

      const existing = kept.get(kind)

      if (existing !== undefined) {
        // the box of the old tree does not belong to this one: the locks are written after the restore, and the plan
        // below must not read the old lock either (a preset leaves a widget free that the previous one pinned)
        lockWidgetTo(existing, undefined)
        widgets.set(kind, existing)
        kept.delete(kind)

        continue
      }

      const waiting = readyWidgets.get(kind)

      if (waiting !== undefined) {
        // a fixed view that came off the dock waits for the next layout: it keeps its renderer and its canvas, so a
        // switch between the layouts that show it does not build them again
        readyWidgets.delete(kind)
        lockWidgetTo(waiting, undefined)
        decorate(waiting)
        widgets.set(kind, waiting)

        continue
      }

      const widget = createWidget(definition)
      decorate(widget)
      widgets.set(kind, widget)
    }

    // the first layout of the dock is the plan of the tree, not the weights of its sizes: a flexible child is a share
    // of the space the locks leave, and lumino reads every weight as a share of the whole split — a ratio of 0.36 next
    // to a locked pixel size would collapse to the css minimums and the pass would read the collapsed ratios back. The
    // locks are not on the widgets yet (the walk below writes them after the restore), so the plan is the one of the
    // tree alone; the pass that follows works it out again with the real limits of the widgets.
    const box = host.getBoundingClientRect()
    let sizes: ReadonlyMap<LayoutNode, number> | undefined

    if (box.width > 0 && box.height > 0) {
      sizes = planLayout(node, { width: box.width, height: box.height }, fitOf, dock.spacing)
    }

    const config = toDockConfig(
      node,
      (kind) => {
        return widgets.get(kind)
      },
      sizes,
    )

    const main = config?.main

    if (main === null || main === undefined) {
      for (const widget of new Set([...previous, ...widgets.values()])) {
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

    // the plates were mounted before the locks were written: the one of a preset switched in the edit mode would say
    // "free" for every widget without this
    refreshOverlays()

    // the echo of this rebuild is not a change of the user either: without this the locks of the tree would be
    // overwritten by the sizes of the preset before the first pass of the sizes has applied them
    appliedTree = toLayoutNode(dock.saveLayout(), widgetKind)

    // a widget that ended up nowhere (the tree changed under it) is thrown away, not left alive
    const live = new Set(dockWidgets(dock))

    for (const widget of new Set([...previous, ...widgets.values()])) {
      if (!live.has(widget)) {
        retire(widget)
      }
    }

    syncLayout()

    // the dock has just been laid out from the weights of the tree, which is close but not the same thing: a lock is
    // a pixel size and a ratio a share of what the locks leave, and the content limits of the widgets are not in the
    // weights at all. The pass is what puts the sizes the preset asks for on the screen — and it takes the tree from
    // here, because the dock's own tree is the collapsed one (see `pendingTree`)
    pendingTree = node

    requestManagedSizes()
  }

  return {
    applyLayout,
    applyManagedSizes,
    requestManagedSizes,
    prepareWidgets,
    disposeReady,
    get appliedTree(): LayoutNode | null {
      return appliedTree
    },
    get isRebuilding(): boolean {
      return isRebuilding
    },
  }
}
