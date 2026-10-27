import type { DockPanel, Widget } from '@lumino/widgets'

/**
 * How close to the edge of the dock the pointer has to be for the drop to take the whole edge of the
 * dock instead of half of one widget, in pixels.
 *
 * @remarks
 * - this is lumino's own `edges` idea (`DockPanel.IEdges`, its default is 12 px): inside the band the
 * drop target is the *root*, not a widget
 * - without it a layout could only be rebuilt by cutting widgets, which is not what a dock editor
 * should do
 */
export const EDGE_ZONE = 100

/**
 * How far from a widget the pointer may be and still count as over it, in pixels.
 *
 * The gaps between the widgets are only a few pixels wide, so the nearest widget wins instead of the
 * widget under the pointer.
 */
export const DROP_DISTANCE = 48

/**
 * The share of the dock a root edge drop takes.
 *
 * @remarks
 * - this is an editor decision, not a lumino one: lumino inserts the new root child with a golden
 * ratio size hint (62% of the dock), which is a lot for a dropped widget, so `placeWidget` normalizes
 * the layout to a third afterwards
 * - the preview shows the same third, otherwise the drop would lie
 */
export const ROOT_ZONE_SHARE = 1 / 3

/**
 * The drop preview is drawn inside the area with this inset, in pixels.
 */
const PREVIEW_INSET = 3

/**
 * The rectangle of an element in client coordinates.
 *
 * It is the pure form of `getBoundingClientRect`, so the hit test can run without a browser.
 */
export interface ClientRect {
  /**
   * The left edge.
   */
  readonly left: number
  /**
   * The top edge.
   */
  readonly top: number
  /**
   * The right edge.
   */
  readonly right: number
  /**
   * The bottom edge.
   */
  readonly bottom: number
  /**
   * The width.
   */
  readonly width: number
  /**
   * The height.
   */
  readonly height: number
}

/**
 * A widget with its rectangle: the pure form of the widget list of the dock.
 */
export interface WidgetRect {
  /**
   * The widget the rectangle belongs to.
   */
  readonly widget: Widget
  /**
   * The rectangle of the widget node.
   */
  readonly rect: ClientRect
}

/**
 * The input of the drop zone hit test.
 */
export interface HitTestInput {
  /**
   * The rectangle of the dock host: the drop area.
   */
  readonly dockRect: ClientRect
  /**
   * The widgets the dock can drop next to (the dragged widget is not in the list).
   */
  readonly widgets: readonly WidgetRect[]
  /**
   * The client X position of the pointer.
   */
  readonly clientX: number
  /**
   * The client Y position of the pointer.
   */
  readonly clientY: number
  /**
   * The width of the edge band of the dock in pixels; defaults to {@link EDGE_ZONE}.
   */
  readonly edgeZone?: number
}

/**
 * Where a dragged widget would land, and relative to which widget.
 */
export interface DropTarget {
  /**
   * The lumino insertion mode: the dragged widget takes the given half of the reference widget, or the
   * given edge of the whole dock when {@link DropTarget.ref} is `null`.
   */
  readonly mode: DockPanel.InsertMode
  /**
   * The reference widget, or `null` when the target is the dock itself (an empty dock, or a drop in
   * the edge band of the dock).
   */
  readonly ref: Widget | null
}

/**
 * A box in the coordinate system of the dock host.
 */
export interface PreviewBox {
  /**
   * The left offset from the dock host.
   */
  readonly left: number
  /**
   * The top offset from the dock host.
   */
  readonly top: number
  /**
   * The width.
   */
  readonly width: number
  /**
   * The height.
   */
  readonly height: number
}

/**
 * Tells whether a point is inside a rectangle.
 *
 * @param rect The rectangle to test.
 * @param clientX The client X position of the point.
 * @param clientY The client Y position of the point.
 *
 * @returns `true` when the point is inside (the edges count as inside).
 */
function isInside(rect: ClientRect, clientX: number, clientY: number): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

/**
 * Computes the distance between a point and a rectangle.
 *
 * @param rect The rectangle to measure from.
 * @param clientX The client X position of the point.
 * @param clientY The client Y position of the point.
 *
 * @returns The distance in pixels, `0` when the point is inside the rectangle.
 */
function distanceToRect(rect: ClientRect, clientX: number, clientY: number): number {
  const dx = Math.max(rect.left - clientX, 0, clientX - rect.right)
  const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom)

  return Math.hypot(dx, dy)
}

/**
 * The half of the reference widget the pointer is closest to.
 *
 * @param rect The rectangle of the reference widget.
 * @param clientX The client X position of the pointer.
 * @param clientY The client Y position of the pointer.
 *
 * @returns The insertion mode for the given position.
 */
export function modeAt(rect: ClientRect, clientX: number, clientY: number): DockPanel.InsertMode {
  const width = Math.max(rect.width, 1)
  const height = Math.max(rect.height, 1)
  const halfWidth = width / 2
  const halfHeight = height / 2
  const centerX = rect.left + halfWidth
  const centerY = rect.top + halfHeight
  const relativeX = (clientX - centerX) / width
  const relativeY = (clientY - centerY) / height

  if (Math.abs(relativeX) >= Math.abs(relativeY)) {
    if (relativeX < 0) {
      return 'split-left'
    }

    return 'split-right'
  }

  if (relativeY < 0) {
    return 'split-top'
  }

  return 'split-bottom'
}

/**
 * Tells which edge of the dock the pointer is close enough to for a root edge drop.
 *
 * @remarks
 * - the nearest edge wins, and on a tie the earlier one in lumino's own order (top, right, bottom,
 * left) is kept
 *
 * @param rect The rectangle of the dock.
 * @param clientX The client X position of the pointer.
 * @param clientY The client Y position of the pointer.
 * @param zone The width of the edge band in pixels.
 *
 * @returns The insertion mode of the edge, or `null` when the pointer is outside the band.
 */
export function edgeZoneAt(
  rect: ClientRect,
  clientX: number,
  clientY: number,
  zone: number,
): DockPanel.InsertMode | null {
  const candidates: Array<{ mode: DockPanel.InsertMode; distance: number }> = [
    { mode: 'split-top', distance: clientY - rect.top },
    { mode: 'split-right', distance: rect.right - clientX },
    { mode: 'split-bottom', distance: rect.bottom - clientY },
    { mode: 'split-left', distance: clientX - rect.left },
  ]

  let nearest = candidates[0]

  for (const candidate of candidates) {
    if (candidate.distance < nearest.distance) {
      nearest = candidate
    }
  }

  if (nearest.distance >= zone) {
    return null
  }

  return nearest.mode
}

/**
 * Finds the drop target under the pointer.
 *
 * @remarks
 * Three outcomes, in this order:
 * - an empty dock takes the widget at the root (the whole dock)
 * - inside the edge band of the dock the drop target is the **root**: the dragged widget becomes a
 * full height (or full width) column and no existing widget is cut in half
 * - otherwise the nearest widget wins and the widget takes the half the pointer is in. The nearest
 * widget is used (not only the one under the pointer), so dropping in the thin gap between two
 * widgets still works; farther than {@link DROP_DISTANCE} from every widget there is no target
 *
 * @param input The dock, the widgets, the pointer and the width of the edge band.
 *
 * @returns The drop target, or `null` when there is none.
 */
export function hitTestDrop(input: HitTestInput): DropTarget | null {
  const { dockRect, widgets, clientX, clientY, edgeZone = EDGE_ZONE } = input

  if (!isInside(dockRect, clientX, clientY)) {
    return null
  }

  if (widgets.length === 0) {
    return { mode: 'tab-after', ref: null }
  }

  const edge = edgeZoneAt(dockRect, clientX, clientY, edgeZone)

  if (edge !== null) {
    return { mode: edge, ref: null }
  }

  let nearest: WidgetRect | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const candidate of widgets) {
    const distance = distanceToRect(candidate.rect, clientX, clientY)

    if (distance < nearestDistance) {
      nearest = candidate
      nearestDistance = distance
    }
  }

  if (nearest === null || nearestDistance > DROP_DISTANCE) {
    return null
  }

  return { mode: modeAt(nearest.rect, clientX, clientY), ref: nearest.widget }
}

/**
 * Finds the rectangle of a widget in the hit test input.
 *
 * @param widgets The widgets of the hit test.
 * @param ref The widget to look for.
 *
 * @returns The rectangle, or `undefined` when the widget is not in the list.
 */
function rectOf(widgets: readonly WidgetRect[], ref: Widget): ClientRect | undefined {
  return widgets.find((candidate) => {
    return candidate.widget === ref
  })?.rect
}

/**
 * Computes the placeholder box of a drop target, relative to the dock host.
 *
 * @remarks
 * - a root edge drop takes a share of the whole dock ({@link ROOT_ZONE_SHARE})
 * - a widget drop takes the half of the reference widget
 * - the box is drawn a few pixels inside the area it covers
 *
 * @param target The drop target to preview.
 * @param dockRect The rectangle of the dock host.
 * @param widgets The widgets of the hit test, so the rectangle of the reference widget can be found.
 *
 * @returns The left, top, width and height of the preview in the dock's coordinate system.
 */
export function previewBox(target: DropTarget, dockRect: ClientRect, widgets: readonly WidgetRect[]): PreviewBox {
  const inset2 = PREVIEW_INSET * 2

  if (target.ref === null) {
    const width = dockRect.width - inset2
    const height = dockRect.height - inset2
    const share = ROOT_ZONE_SHARE
    const rest = 1 - share
    const shareWidth = width * share
    const shareHeight = height * share
    const restWidth = width * rest
    const restHeight = height * rest
    const fromRight = PREVIEW_INSET + restWidth
    const fromBottom = PREVIEW_INSET + restHeight

    if (target.mode === 'split-left') {
      return { left: PREVIEW_INSET, top: PREVIEW_INSET, width: shareWidth, height }
    }

    if (target.mode === 'split-right') {
      return { left: fromRight, top: PREVIEW_INSET, width: shareWidth, height }
    }

    if (target.mode === 'split-top') {
      return { left: PREVIEW_INSET, top: PREVIEW_INSET, width, height: shareHeight }
    }

    if (target.mode === 'split-bottom') {
      return { left: PREVIEW_INSET, top: fromBottom, width, height: shareHeight }
    }

    return { left: PREVIEW_INSET, top: PREVIEW_INSET, width, height }
  }

  const rect = rectOf(widgets, target.ref)

  if (rect === undefined) {
    return { left: PREVIEW_INSET, top: PREVIEW_INSET, width: dockRect.width - inset2, height: dockRect.height - inset2 }
  }

  const left = rect.left - dockRect.left + PREVIEW_INSET
  const top = rect.top - dockRect.top + PREVIEW_INSET
  const width = rect.width - inset2
  const height = rect.height - inset2
  const halfWidth = width / 2
  const halfHeight = height / 2

  if (target.mode === 'split-left') {
    return { left, top, width: halfWidth, height }
  }

  if (target.mode === 'split-right') {
    return { left: left + halfWidth, top, width: halfWidth, height }
  }

  if (target.mode === 'split-top') {
    return { left, top, width, height: halfHeight }
  }

  if (target.mode === 'split-bottom') {
    return { left, top: top + halfHeight, width, height: halfHeight }
  }

  return { left, top, width, height }
}
