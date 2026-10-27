import type { DockPanel, Widget } from '@lumino/widgets'
import { dockWidgets } from './dockWidgets.ts'
import { hitTestDrop, previewBox, type ClientRect, type DropTarget, type WidgetRect } from './hitTest.ts'

/**
 * How far the pointer has to move before a press becomes a drag, in pixels.
 *
 * It keeps a click on the overlay from turning into a one-pixel drag.
 */
const DRAG_THRESHOLD = 4

/**
 * The input of a widget drag.
 */
export interface DragOptions {
  /**
   * The widget name shown on the ghost.
   */
  readonly label: string
  /**
   * Where the pointer was when the drag was armed.
   */
  readonly clientX: number
  /**
   * Where the pointer was when the drag was armed.
   */
  readonly clientY: number
  /**
   * The pointer that has to be released to finish the drag.
   */
  readonly pointerId: number
  /**
   * The dock whose widgets are the drop targets.
   */
  readonly dock: DockPanel
  /**
   * The host element of the dock: the drop area and the coordinate origin of the preview.
   */
  readonly container: HTMLElement
  /**
   * The widget that is being dragged; it is never a target for itself.
   */
  readonly exclude?: Widget | null
  /**
   * Called when the drag really starts and when it is over.
   */
  readonly onDragStateChange?: (dragging: boolean) => void
}

/**
 * The widgets the hit test can drop next to, with their rectangles.
 */
interface DropAreas {
  /**
   * The rectangle of the dock host.
   */
  readonly dockRect: ClientRect
  /**
   * The widgets of the dock, without the dragged one.
   */
  readonly widgets: readonly WidgetRect[]
}

/**
 * Collects the rectangles the hit test works on.
 *
 * @param dock The dock whose widgets are the drop targets.
 * @param container The host element of the dock.
 * @param exclude The widget that is being dragged.
 *
 * @returns The rectangle of the dock host and the rectangles of the widgets.
 */
function collectDropAreas(dock: DockPanel, container: HTMLElement, exclude?: Widget | null): DropAreas {
  return {
    dockRect: container.getBoundingClientRect(),
    widgets: dockWidgets(dock)
      .filter((widget) => {
        return widget !== exclude
      })
      .map((widget) => {
        return { widget, rect: widget.node.getBoundingClientRect() }
      }),
  }
}

/**
 * Creates the element that follows the pointer during a drag.
 *
 * @param label The widget name shown on the ghost.
 *
 * @returns A detached element; the drag attaches it to the body when the drag starts.
 */
function createGhost(label: string): HTMLDivElement {
  const ghost = document.createElement('div')
  ghost.className = 'drag-ghost'
  ghost.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h14"></path><path d="M5 15h14"></path></svg>'

  const text = document.createElement('span')
  text.textContent = label
  ghost.append(text)

  return ghost
}

/**
 * Creates the drop preview element and puts it into the dock host.
 *
 * @param container The host element of the dock.
 *
 * @returns The preview element, hidden until a target is found.
 */
function createPreview(container: HTMLElement): HTMLDivElement {
  const preview = document.createElement('div')
  preview.className = 'drop-preview'
  container.append(preview)

  return preview
}

/**
 * Tells whether two drop targets are the same.
 *
 * @param first The first target, or `null`.
 * @param second The second target, or `null`.
 *
 * @returns `true` when both are `null` or both point to the same widget with the same mode.
 */
function isSameTarget(first: DropTarget | null, second: DropTarget | null): boolean {
  if (first === null || second === null) {
    return first === second
  }

  return first.ref === second.ref && first.mode === second.mode
}

/**
 * One drag of a widget, from the press to the release.
 *
 * @remarks
 * - the drag is armed by a `pointerdown` on the caller's element; the caller awaits `run()` and places
 * the widget with the drop target it gets back
 * - `Escape` cancels the drag (and stops the event, so the edit mode is not left by the same press)
 * - a release outside the window never reaches the page, so the window's `blur` also cancels the drag:
 * the ghost must not stay on the screen
 */
class DragSession {
  private readonly options: DragOptions
  private readonly ghost: HTMLDivElement
  private readonly preview: HTMLDivElement
  private dragging = false
  private target: DropTarget | null = null
  private settled = false
  private resolve?: (result: DropTarget | null) => void

  /**
   * Creates the session of one drag: the ghost and the preview are built up front, the listeners are
   * wired in {@link DragSession.run}.
   *
   * @param options Where the pointer was, the dock, the dragged widget and the label of the ghost.
   */
  constructor(options: DragOptions) {
    this.options = options
    this.ghost = createGhost(options.label)
    this.preview = createPreview(options.container)
  }

  /**
   * Waits for the release of the pointer.
   *
   * @returns The drop target under the pointer at release, or `null` when the drag was cancelled.
   */
  async run(): Promise<DropTarget | null> {
    const promise = new Promise<DropTarget | null>((resolve) => {
      this.resolve = resolve
    })

    globalThis.addEventListener('pointermove', this.handlePointerMove, { capture: true })
    globalThis.addEventListener('pointerup', this.handlePointerUp, { capture: true })
    globalThis.addEventListener('pointercancel', this.handlePointerCancel, { capture: true })
    globalThis.addEventListener('keydown', this.handleKeyDown, { capture: true })
    globalThis.addEventListener('blur', this.handleBlur, { capture: true })

    return await promise
  }

  /**
   * Cleans up the drag and hands the result to the caller.
   *
   * @param result The drop target at release, or `null` when the drag was cancelled.
   */
  private settle(result: DropTarget | null): void {
    if (this.settled) {
      return
    }

    this.settled = true
    globalThis.removeEventListener('pointermove', this.handlePointerMove, true)
    globalThis.removeEventListener('pointerup', this.handlePointerUp, true)
    globalThis.removeEventListener('pointercancel', this.handlePointerCancel, true)
    globalThis.removeEventListener('keydown', this.handleKeyDown, true)
    globalThis.removeEventListener('blur', this.handleBlur, true)
    this.ghost.remove()
    this.preview.remove()
    document.body.classList.remove('is-dragging')

    if (this.dragging) {
      this.options.exclude?.node.classList.remove('is-drag-source')
      this.options.onDragStateChange?.(false)
    }

    this.resolve?.(result)
  }

  /**
   * Moves the ghost and refreshes the drop preview.
   *
   * @param event The pointer event the browser sends while the button is held.
   */
  private readonly handlePointerMove = (event: PointerEvent): void => {
    const { pointerId, dock, container, exclude } = this.options

    if (event.pointerId !== pointerId) {
      return
    }

    if (!this.dragging) {
      const moved = Math.hypot(event.clientX - this.options.clientX, event.clientY - this.options.clientY)

      if (moved < DRAG_THRESHOLD) {
        return
      }

      this.dragging = true
      document.body.append(this.ghost)
      document.body.classList.add('is-dragging')
      exclude?.node.classList.add('is-drag-source')
      this.options.onDragStateChange?.(true)
    }

    this.ghost.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 12}px, 0)`

    const areas = collectDropAreas(dock, container, exclude)
    const next = hitTestDrop({ ...areas, clientX: event.clientX, clientY: event.clientY })

    if (isSameTarget(next, this.target)) {
      return
    }

    this.target = next
    this.showPreview(areas, next)
  }

  /**
   * Finishes the drag at the current target.
   *
   * @param event The pointer event of the release.
   */
  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId === this.options.pointerId) {
      this.settle(this.target)
    }
  }

  /**
   * Cancels the drag when the browser takes the pointer away.
   *
   * @param event The pointer event the browser sends when it takes the pointer away.
   */
  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.options.pointerId) {
      this.settle(null)
    }
  }

  /**
   * Cancels the drag with `Escape`.
   *
   * @param event The keydown event of the document.
   */
  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.settle(null)
    }
  }

  /**
   * Cancels the drag when the window loses the focus.
   */
  private readonly handleBlur = (): void => {
    this.settle(null)
  }

  /**
   * Draws the drop preview for a target, or hides it.
   *
   * @param areas The rectangles of the hit test.
   * @param target The drop target, or `null` to hide the preview.
   */
  private showPreview(areas: DropAreas, target: DropTarget | null): void {
    if (target === null) {
      this.preview.classList.remove('is-visible')
      return
    }

    const box = previewBox(target, areas.dockRect, areas.widgets)
    this.preview.style.left = `${box.left}px`
    this.preview.style.top = `${box.top}px`
    this.preview.style.width = `${box.width}px`
    this.preview.style.height = `${box.height}px`
    this.preview.classList.add('is-visible')
  }
}

/**
 * Runs a widget drag until the pointer is released or the drag is cancelled with `Escape`.
 *
 * @param options Where the pointer was, the dock, the dragged widget and the label of the ghost.
 *
 * @returns The drop target under the pointer at release, or `null` when the drag was cancelled.
 */
export async function dragWidget(options: DragOptions): Promise<DropTarget | null> {
  const session = new DragSession(options)

  return await session.run()
}
