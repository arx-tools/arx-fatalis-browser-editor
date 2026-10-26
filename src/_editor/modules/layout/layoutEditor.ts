import type { DockPanel, Widget } from '@lumino/widgets'
import { dragWidget } from './dragDrop.ts'
import { placeWidget } from './placement.ts'

/**
 * What the overlay of a widget shows and does.
 */
export interface WidgetOverlayOptions {
  /**
   * The name of the widget, shown on the plate.
   */
  readonly label: string
  /**
   * Called when the trash of the plate is clicked.
   */
  readonly onRemove: () => void
}

/**
 * Mounts the overlay of a widget into the element the editor created.
 *
 * @remarks
 * The editor does not know how the overlay is drawn: the caller passes this function, so the module
 * stays free of `.vue` imports (the components can not be loaded by `node --test`) and a test can
 * mount a stand-in instead.
 */
export type MountWidgetOverlay = (host: HTMLElement, options: WidgetOverlayOptions) => () => void

/**
 * The overlay of one widget: the element and the function that tears it down.
 */
interface Overlay {
  /**
   * The element the overlay is mounted into.
   */
  readonly host: HTMLElement
  /**
   * Unmounts the overlay.
   */
  readonly unmount: () => void
}

/**
 * The layout edit mode: the open lock of the header.
 *
 * @remarks
 * - in edit mode every widget gets an overlay with its name and a trash icon; the overlay is the drag
 * handle, and the trash removes the widget (lumino reflows the freed space by itself)
 * - the overlay only exists while the mode is on: the widgets are decorated as they are added, but the
 * Vue apps are mounted when the lock opens and unmounted when it closes, so a locked layout has no
 * overlay in the DOM at all
 * - the edit mode is the *only* time a widget is dragged or deleted, so the dock stays interactive
 * while the layout is locked
 */
export class LayoutEditor {
  private readonly dock: DockPanel
  private readonly container: HTMLElement
  private readonly mountOverlay: MountWidgetOverlay
  private readonly widgets = new Set<Widget>()
  private readonly overlays = new Map<Widget, Overlay>()
  private unlocked = false

  /**
   * Creates the editor of one dock.
   *
   * @param dock The dock panel whose widgets can be moved and deleted.
   * @param container The host element of the dock (the mode class lives here, because the dock node
   * itself is created by lumino).
   * @param mountOverlay Mounts the overlay of a widget into an element and returns its teardown.
   */
  constructor(dock: DockPanel, container: HTMLElement, mountOverlay: MountWidgetOverlay) {
    this.dock = dock
    this.container = container
    this.mountOverlay = mountOverlay
  }

  /**
   * Tells whether the layout editor is on.
   */
  get isUnlocked(): boolean {
    return this.unlocked
  }

  /**
   * Registers a widget for the edit mode.
   *
   * It has to be called once per widget, before the widget is added to the dock.
   *
   * @param widget The widget to register.
   */
  decorate(widget: Widget): void {
    this.widgets.add(widget)

    if (this.unlocked) {
      this.attachOverlay(widget)
    }
  }

  /**
   * Turns the edit mode on or off.
   *
   * @param unlocked `true` for edit mode (open lock), `false` for the normal, locked layout.
   */
  setUnlocked(unlocked: boolean): void {
    this.unlocked = unlocked
    this.container.classList.toggle('is-editing', unlocked)

    if (unlocked) {
      for (const widget of this.widgets) {
        this.attachOverlay(widget)
      }

      return
    }

    for (const widget of this.widgets) {
      this.detachOverlay(widget)
    }
  }

  /**
   * Deletes a widget; the dock reflows the remaining ones into the freed space.
   *
   * @param widget The widget to delete.
   */
  removeWidget(widget: Widget): void {
    this.detachOverlay(widget)
    this.widgets.delete(widget)

    // `dispose` detaches the widget from the dock (the dock drops the empty area) and releases the
    // resources of the widget, for example the WebGL context of the 3D view
    widget.dispose()
  }

  /**
   * Unmounts every overlay, so a hot reload does not leave live Vue apps behind.
   */
  dispose(): void {
    for (const widget of this.widgets) {
      this.detachOverlay(widget)
    }

    this.widgets.clear()
  }

  /**
   * Mounts the overlay of a widget, if the edit mode is on and the widget is on the dock.
   *
   * @param widget The widget to decorate.
   */
  private attachOverlay(widget: Widget): void {
    if (this.overlays.has(widget) || widget.isDisposed) {
      return
    }

    const host = document.createElement('div')
    host.className = 'WidgetOverlay-host'
    widget.node.append(host)

    const unmount = this.mountOverlay(host, {
      label: widget.title.label,
      onRemove: () => {
        this.removeWidget(widget)
      },
    })

    // the overlay covers the widget, so the press that starts a drag lands on the host
    host.addEventListener('pointerdown', (event) => {
      void this.startDrag(event, widget)
    })

    this.overlays.set(widget, { host, unmount })
  }

  /**
   * Unmounts the overlay of a widget.
   *
   * @param widget The widget whose overlay goes away.
   */
  private detachOverlay(widget: Widget): void {
    const overlay = this.overlays.get(widget)

    if (overlay === undefined) {
      return
    }

    this.overlays.delete(widget)
    overlay.unmount()
    overlay.host.remove()
  }

  /**
   * Moves a widget to the place the user dropped it on.
   *
   * @param event The press that armed the drag.
   * @param widget The widget to move.
   */
  private async startDrag(event: PointerEvent, widget: Widget): Promise<void> {
    if (!this.unlocked || event.button !== 0) {
      return
    }

    // no text selection and no caret while the overlay is dragged around
    event.preventDefault()

    const target = await dragWidget({
      label: widget.title.label,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      dock: this.dock,
      container: this.container,
      exclude: widget,
    })

    placeWidget(this.dock, widget, target)
  }
}
