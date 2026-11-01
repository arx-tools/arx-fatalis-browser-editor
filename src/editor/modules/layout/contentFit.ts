import type { LayoutNode } from './layoutNode.ts'

/**
 * The minimum height of a widget when there is no room for the height its content wants.
 *
 * @remarks
 * It is not zero: a widget squeezed to nothing could not be dragged back (the splitter needs a line to grab) and the
 * dock would look broken. 40 is the height of the header of a widget plus a line.
 */
export const MIN_WIDGET_HEIGHT = 40

/**
 * How high the content of a widget wants to be, or nothing when the widget fills its space instead.
 *
 * @remarks
 * The two kinds of widgets of the editor behave differently, and the difference is what the layout needs to know. The
 * **views** (the walkable one and the six fixed ones) are a canvas: they have no natural height, they fill the space
 * they are given, and they are the ones that should grow when the window does. The **lists and forms** (the
 * statistics, the inspector, the key table, the camera form, the jump row) are content: they want as much height as
 * their rows take, no more, and cutting them means scrolling inside a small box.
 */
export type WantedHeight = number | undefined

/**
 * The minimum height worked out for one widget of the dock.
 */
export interface MinPlan {
  /**
   * The kind of the widget.
   */
  readonly kind: string
  /**
   * The minimum height it should get.
   */
  readonly min: number
}

/**
 * Works out the minimum height of every widget of a column.
 *
 * @remarks
 * This is the `min-height: min-content` of a flexbox, with the one difference that keeps the window free of a
 * scrollbar: the minimums are **soft**. While the sum of the heights the contents want **fits** into the space, every
 * widget gets its own height as a minimum — so the lists are not cut, and the leftover goes to the views, which have
 * no minimum. When the sum **does not fit**, the minimums fall back to {@link MIN_WIDGET_HEIGHT}: every widget
 * shrinks and the content scrolls **inside** it, which is what the owner asked for (a widget being scrollable is not
 * decided by the layout).
 *
 * @param wanted The height each widget's content wants, in the order of the column; `undefined` for a widget that
 * fills its space (a view).
 * @param available The height the column has.
 *
 * @returns The minimum height of every widget, in the same order.
 */
export function contentMins(wanted: readonly WantedHeight[], available: number): number[] {
  const wantedTotal = wanted.reduce<number>((total, height) => {
    return total + (height ?? 0)
  }, 0)

  return wanted.map((height) => {
    // the content does not fit: every widget goes to the floor, and the content scrolls inside it
    if (height === undefined || wantedTotal > available) {
      return MIN_WIDGET_HEIGHT
    }

    return Math.max(MIN_WIDGET_HEIGHT, Math.round(height))
  })
}

/**
 * The height a node wants, as a vertical split sees it.
 *
 * @param node The node to ask.
 * @param measure The height the content of a widget kind wants.
 *
 * @returns The height of a widget, or the tallest of a row of widgets.
 */
function wantedOf(node: LayoutNode, measure: (kind: string) => number | undefined): WantedHeight {
  if (node.type === 'widget') {
    return measure(node.kind)
  }

  const heights = node.children
    .map((child) => {
      return wantedOf(child, measure)
    })
    .filter((height) => {
      return height !== undefined
    })

  if (heights.length === 0) {
    return undefined
  }

  return Math.max(...heights)
}

/**
 * Gives every widget of a row the same minimum height.
 *
 * @param node The node to walk: a widget, or a split whose widgets share the same height.
 * @param min The height the whole row gets.
 *
 * @returns One plan entry for every widget in the row.
 */
function rowPlan(node: LayoutNode, min: number): MinPlan[] {
  if (node.type === 'widget') {
    return [{ kind: node.kind, min }]
  }

  return node.children.flatMap((child) => {
    return rowPlan(child, min)
  })
}

/**
 * Works out the minimum height of every widget of a layout tree.
 *
 * @remarks
 * The minimums are **per column**: a vertical split is where the widgets share a height, so it is where the heights
 * of the contents have to be added up. A horizontal split only passes the walk down to its children (the columns sit
 * side by side, so they do not take height from each other). A child that is itself a split is a row of widgets: it
 * wants the height of its tallest member, and that one height is what its whole group gets.
 *
 * @param tree The layout tree, as the dock has it.
 * @param measure The height the content of a widget kind wants, or `undefined` for a view.
 * @param available The height a column has.
 *
 * @returns The minimum height of every widget, in the order the tree walks them.
 */
export function planMins(
  tree: LayoutNode,
  measure: (kind: string) => number | undefined,
  available: number,
): MinPlan[] {
  if (tree.type === 'widget') {
    return []
  }

  if (tree.orientation === 'horizontal') {
    return tree.children.flatMap((child) => {
      return planMins(child, measure, available)
    })
  }

  const mins = contentMins(
    tree.children.map((child) => {
      return wantedOf(child, measure)
    }),
    available,
  )

  return tree.children.flatMap((child, index) => {
    const min = mins[index] ?? MIN_WIDGET_HEIGHT

    if (child.type === 'widget') {
      return [{ kind: child.kind, min }]
    }

    // a row inside the column: every widget of it gets the height of the row
    return rowPlan(child, min)
  })
}
