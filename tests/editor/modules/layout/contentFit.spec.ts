import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fitOfNode,
  MIN_WIDGET_HEIGHT,
  MIN_WIDGET_WIDTH,
  planLayout,
  splitSizes,
  type ChildFit,
  type WidgetFit,
} from '../../../../src/editor/modules/layout/contentFit.ts'
import { flexSizes, type LayoutNode } from '../../../../src/editor/modules/layout/layoutNode.ts'

/**
 * The limits of a widget that fills whatever it gets: the view of the editor, with no content of its own.
 *
 * @returns The limits of a view.
 */
function view(): WidgetFit {
  return {
    width: { min: MIN_WIDGET_WIDTH, floor: MIN_WIDGET_WIDTH, max: Number.POSITIVE_INFINITY },
    height: { min: MIN_WIDGET_HEIGHT, floor: MIN_WIDGET_HEIGHT, max: Number.POSITIVE_INFINITY },
  }
}

/**
 * The limits of a widget with a height its rows want, and no lock.
 *
 * @param height The height the rows want.
 *
 * @returns The limits of a list.
 */
function list(height: number): WidgetFit {
  return { ...view(), height: { ...view().height, min: height } }
}

/**
 * The limits of a widget locked to a box.
 *
 * @param width The width of the lock.
 * @param height The height of the lock.
 *
 * @returns The limits of a locked widget.
 */
function locked(width: number, height: number): WidgetFit {
  return {
    width: { min: MIN_WIDGET_WIDTH, floor: MIN_WIDGET_WIDTH, max: width },
    height: { min: MIN_WIDGET_HEIGHT, floor: MIN_WIDGET_HEIGHT, max: height },
  }
}

/**
 * Reads the limits of a widget kind from a table, so a tree can be planned without a dock.
 *
 * @param table The limits per kind.
 *
 * @returns The reader the plan asks for.
 */
function fitsOf(table: Record<string, WidgetFit>): (kind: string) => WidgetFit {
  return (kind) => {
    return table[kind] ?? view()
  }
}

/**
 * A child of a split with a hint and a range.
 *
 * @param hint The size it asks for.
 * @param min The size its content wants.
 * @param floor The smallest size it may ever take.
 * @param max The biggest size it may take.
 *
 * @returns The child fit.
 */
function child(hint: number, min = 0, floor = 0, max = Number.POSITIVE_INFINITY): ChildFit {
  return { hint, min, floor, max }
}

/**
 * Reads one child of a split.
 *
 * @param tree The tree to read.
 * @param index Which child to take.
 *
 * @returns The node that sits at that place.
 *
 * @throws When the node is not a split or it has no child at that place, which means the test built a broken tree.
 */
function childAt(tree: LayoutNode, index: number): LayoutNode {
  if (tree.type !== 'split') {
    throw new Error('the test expects a split')
  }

  const child = tree.children[index]

  if (child === undefined) {
    throw new Error(`the test expects at least ${String(index + 1)} children`)
  }

  return child
}

/**
 * Adds up the sizes of a list.
 *
 * @param values The sizes to add.
 *
 * @returns Their sum.
 */
function sum(values: readonly number[]): number {
  let total = 0

  for (const value of values) {
    total = total + value
  }

  return total
}

void describe('splitSizes', () => {
  void it('gives every child its hint when the hints fit', () => {
    assert.deepEqual(splitSizes(1000, [child(200), child(600), child(200)]), [200, 600, 200])
  })

  void it('hands the space a lock does not use to the others', () => {
    // the middle child is locked to 300: what it does not take goes to the free ones, no hole is left
    assert.deepEqual(splitSizes(1000, [child(200), child(600, 0, 40, 300), child(200)]), [350, 300, 350])
  })

  void it('keeps the minimum of every child when the hints are too small', () => {
    assert.deepEqual(splitSizes(1000, [child(100, 200, 40), child(900, 0, 40, 300)]), [700, 300])
  })

  void it('shrinks everything when the space is smaller than the minimums', () => {
    const sizes = splitSizes(300, [child(200, 200, 200), child(200, 200, 200)])

    assert.equal(sum(sizes), 300)
    assert.deepEqual(sizes, [150, 150])
  })

  void it('shrinks a lock that is bigger than the space', () => {
    const sizes = splitSizes(200, [child(800, 0, 40, 800)])

    assert.deepEqual(sizes, [200])
  })

  void it('takes the space a lock needs from the children that are not locked', () => {
    // the locked child keeps its 400 and the two free ones give the 100 the lock needs
    const sizes = splitSizes(500, [child(400, 0, 40, 400), child(100, 40, 40), child(100, 40, 40)])

    assert.equal(sum(sizes), 500)
    assert.deepEqual(sizes, [400, 50, 50])
  })
})

void describe('fitOfNode', () => {
  void it('adds up the heights of a column', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(0.5, 0.5),
      children: [
        { type: 'widget', kind: 'first' },
        { type: 'widget', kind: 'second' },
      ],
    }

    const fit = fitOfNode(tree, 'vertical', fitsOf({ first: list(200), second: list(300) }))

    assert.equal(fit.min, 500)
    assert.equal(fit.max, Number.POSITIVE_INFINITY)
  })

  void it('takes the smallest maximum of the widgets a column holds', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(0.5, 0.5),
      children: [
        { type: 'widget', kind: 'first' },
        { type: 'widget', kind: 'second' },
      ],
    }

    const fit = fitOfNode(tree, 'horizontal', fitsOf({ first: locked(400, 200), second: view() }))

    assert.equal(fit.min, MIN_WIDGET_WIDTH)
    assert.equal(fit.max, 400)
  })
})

void describe('planLayout', () => {
  void it('gives a row of a column the height the row got', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(0.5, 0.5),
      children: [
        {
          type: 'split',
          orientation: 'horizontal',
          sizes: flexSizes(0.6, 0.4),
          children: [
            { type: 'widget', kind: 'form' },
            { type: 'widget', kind: 'jump' },
          ],
        },
        { type: 'widget', kind: '3d-view' },
      ],
    }

    const sizes = planLayout(tree, { width: 800, height: 600 }, fitsOf({ form: list(60), jump: list(60) }))
    assert.equal(sizes.get(childAt(tree, 0)), 300)
    assert.equal(sizes.get(childAt(tree, 1)), 300)

    const row = childAt(tree, 0)

    assert.equal(sizes.get(childAt(row, 0)), 480)
    assert.equal(sizes.get(childAt(row, 1)), 320)
  })

  void it('keeps the lock of a widget and gives the rest to the free ones', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(1 / 3, 1 / 3, 1 / 3),
      children: [
        { type: 'widget', kind: 'stats' },
        { type: 'widget', kind: 'inspector' },
        { type: 'widget', kind: 'shortcuts' },
      ],
    }

    const sizes = planLayout(
      tree,
      { width: 400, height: 900 },
      fitsOf({ stats: locked(400, 300), inspector: locked(400, 300), shortcuts: list(400) }),
    )

    // the two locked ones keep their heights and the third one takes the rest of the column
    assert.equal(sizes.get(childAt(tree, 0)), 300)
    assert.equal(sizes.get(childAt(tree, 1)), 300)
    assert.equal(sizes.get(childAt(tree, 2)), 300)
  })

  void it('shrinks the locks when there is no room for them', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'vertical',
      sizes: flexSizes(0.5, 0.5),
      children: [
        { type: 'widget', kind: 'stats' },
        { type: 'widget', kind: 'inspector' },
      ],
    }

    const sizes = planLayout(
      tree,
      { width: 400, height: 400 },
      fitsOf({ stats: locked(400, 500), inspector: locked(400, 500) }),
    )

    assert.equal(sizes.get(childAt(tree, 0)), 200)
    assert.equal(sizes.get(childAt(tree, 1)), 200)
  })

  void it('keeps the width of a column that holds a locked widget', () => {
    const tree: LayoutNode = {
      type: 'split',
      orientation: 'horizontal',
      sizes: [
        { kind: 'auto', ratio: 0.5 },
        { kind: 'fixed', px: 300 },
        { kind: 'auto', ratio: 0.5 },
      ],
      children: [
        { type: 'widget', kind: 'left-view' },
        {
          type: 'split',
          orientation: 'vertical',
          sizes: [{ kind: 'fixed', px: 300 }],
          children: [{ type: 'widget', kind: 'stats' }],
        },
        { type: 'widget', kind: '3d-view' },
      ],
    }
    const sizes = planLayout(tree, { width: 1000, height: 600 }, fitsOf({ stats: locked(300, 300) }))

    // the column of the locked statistics keeps the width of the lock, and the two others share the rest
    assert.equal(sizes.get(childAt(tree, 1)), 300)
    assert.equal((sizes.get(childAt(tree, 0)) ?? 0) + (sizes.get(childAt(tree, 2)) ?? 0), 700)
  })
})
