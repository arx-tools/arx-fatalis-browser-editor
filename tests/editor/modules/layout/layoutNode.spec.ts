import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  collectKinds,
  flexSizes,
  layoutEquals,
  parseLayoutNode,
  type LayoutNode,
} from '../../../../src/editor/modules/layout/layoutNode.ts'
import { editorLayout, viewerLayout } from '../../../../src/editor/modules/layout/layoutPresets.ts'

/**
 * A widget leaf of the test trees.
 *
 * @param kind The identifier of the widget kind.
 *
 * @returns The leaf.
 */
function widget(kind: string): LayoutNode {
  return { type: 'widget', kind }
}

/**
 * A split of the test trees.
 *
 * @param orientation Which way the nodes follow each other.
 * @param children The nodes to place next to (or above) each other.
 *
 * @returns The tree node, with equal shares.
 */
function split(orientation: 'horizontal' | 'vertical', children: LayoutNode[]): LayoutNode {
  return {
    type: 'split',
    orientation,
    sizes: flexSizes(
      ...children.map(() => {
        return 1 / children.length
      }),
    ),
    children,
  }
}

/**
 * Reads the box a preset locks a widget to.
 *
 * @remarks
 * The two sides of a lock live on two levels of the tree (the width on a horizontal split, the height on a vertical
 * one), so the walk carries both down to the leaf, the way the shell puts the lock back on the node of the widget.
 *
 * @param tree The preset to read.
 * @param kind The kind of the widget to look for.
 *
 * @returns The box the widget is locked to, or `undefined` when it is free.
 */
function lockOfKind(tree: LayoutNode, kind: string): { width: number; height: number } | undefined {
  /**
   * Walks one node of the tree with the sides its ancestors have fixed.
   *
   * @param node The node to walk.
   * @param width The width the ancestors fixed, or `undefined`.
   * @param height The height the ancestors fixed, or `undefined`.
   *
   * @returns The lock of the widget, or `undefined` when nothing under the node is locked.
   */
  function walk(
    node: LayoutNode,
    width: number | undefined,
    height: number | undefined,
  ): { width: number; height: number } | undefined {
    if (node.type === 'widget') {
      if (width === undefined || height === undefined || node.kind !== kind) {
        return undefined
      }

      return { width, height }
    }

    for (const [index, child] of node.children.entries()) {
      const size = node.sizes[index]
      let nextWidth = width
      let nextHeight = height

      if (size?.kind === 'fixed' && node.orientation === 'horizontal') {
        nextWidth = size.px
      } else if (size?.kind === 'fixed') {
        nextHeight = size.px
      }

      const found = walk(child, nextWidth, nextHeight)

      if (found !== undefined) {
        return found
      }
    }

    return undefined
  }

  return walk(tree, undefined, undefined)
}

void describe('the editor preset', () => {
  void it('puts the small views on the left, the walkable view in the middle and the numbers on the right', () => {
    const root = editorLayout as Extract<LayoutNode, { type: 'split' }>

    assert.equal(root.orientation, 'horizontal')
    assert.deepEqual(collectKinds(root), [
      'top-view',
      'left-view',
      'front-view',
      'camera-controls',
      'jump-to-location',
      '3d-view',
      'map-statistics',
      'polygon-inspector',
      'keyboard-shortcuts',
    ])
  })

  void it('locks the widgets to the sizes the owner measured off the plate', () => {
    assert.deepEqual(lockOfKind(editorLayout, 'top-view'), { width: 350, height: 350 })
    assert.deepEqual(lockOfKind(editorLayout, 'jump-to-location'), { width: 200, height: 50 })
    assert.deepEqual(lockOfKind(editorLayout, 'map-statistics'), { width: 350, height: 210 })
    assert.deepEqual(lockOfKind(editorLayout, 'polygon-inspector'), { width: 350, height: 190 })
  })

  void it('leaves the widgets the owner did not size free', () => {
    const locks = ['camera-controls', '3d-view', 'left-view', 'front-view', 'keyboard-shortcuts'].map((kind) => {
      return lockOfKind(editorLayout, kind)
    })

    assert.deepEqual(locks, [undefined, undefined, undefined, undefined, undefined])
  })
})

void describe('the presets', () => {
  void it('keeps the render performance readout off the dock until the user adds it', () => {
    assert.deepEqual(
      [editorLayout, viewerLayout].map((tree) => {
        return collectKinds(tree).includes('render-performance')
      }),
      [false, false],
    )
  })
})

void describe('the viewer preset', () => {
  void it('locks the plan and the jump to the sizes the owner measured off the plate', () => {
    assert.deepEqual(lockOfKind(viewerLayout, 'top-view'), { width: 350, height: 285 })
    assert.deepEqual(lockOfKind(viewerLayout, 'jump-to-location'), { width: 350, height: 80 })
  })

  void it('leaves the walkable view and the keys free', () => {
    assert.equal(lockOfKind(viewerLayout, '3d-view'), undefined)
    assert.equal(lockOfKind(viewerLayout, 'keyboard-shortcuts'), undefined)
  })
})

void describe('collectKinds', () => {
  void it('gives the kinds of the editor layout', () => {
    assert.deepEqual(collectKinds(editorLayout).toSorted(), [
      '3d-view',
      'camera-controls',
      'front-view',
      'jump-to-location',
      'keyboard-shortcuts',
      'left-view',
      'map-statistics',
      'polygon-inspector',
      'top-view',
    ])
  })

  void it('keeps the order of the layout', () => {
    const tree = split('vertical', [widget('help'), widget('view3d')])

    assert.deepEqual(collectKinds(tree), ['help', 'view3d'])
  })

  void it('gives a single kind for a leaf', () => {
    assert.deepEqual(collectKinds(widget('camera')), ['camera'])
  })

  void it('lists a kind once', () => {
    const inner = split('vertical', [widget('help'), widget('camera')])
    const tree = split('horizontal', [widget('help'), inner])

    assert.deepEqual(collectKinds(tree), ['help', 'camera'])
  })
})

void describe('layoutEquals', () => {
  void it('accepts the same tree', () => {
    assert.equal(layoutEquals(editorLayout, editorLayout), true)
  })

  void it('sees a different kind', () => {
    assert.equal(layoutEquals(widget('help'), widget('camera')), false)
  })

  void it('sees a different shape', () => {
    const tree = split('horizontal', [widget('help')])

    assert.equal(layoutEquals(widget('help'), tree), false)
  })

  void it('sees a different orientation', () => {
    const horizontal = split('horizontal', [widget('help'), widget('camera')])
    const vertical = split('vertical', [widget('help'), widget('camera')])

    assert.equal(layoutEquals(horizontal, vertical), false)
  })

  void it('allows a rounding difference in the sizes', () => {
    const first = split('horizontal', [widget('help'), widget('camera')])
    const second = { ...first, sizes: flexSizes(0.5001, 0.4999) }

    assert.equal(layoutEquals(first, second), true)
  })

  void it('sees a real size change', () => {
    const first = split('horizontal', [widget('help'), widget('camera')])
    const second = { ...first, sizes: flexSizes(0.7, 0.3) }

    assert.equal(layoutEquals(first, second), false)
  })
})

void describe('parseLayoutNode', () => {
  void it('reads the default layout back', () => {
    const parsed = parseLayoutNode(structuredClone(editorLayout))

    assert.ok(parsed)
    assert.equal(layoutEquals(parsed, editorLayout), true)
  })

  void it('rejects everything that is not a layout', () => {
    assert.equal(parseLayoutNode(null), null)
    assert.equal(parseLayoutNode(42), null)
    assert.equal(parseLayoutNode('layout'), null)
    assert.equal(parseLayoutNode({}), null)
    assert.equal(parseLayoutNode({ type: 'widget' }), null)
    assert.equal(parseLayoutNode({ type: 'widget', kind: '' }), null)
    assert.equal(parseLayoutNode({ type: 'split', orientation: 'diagonal' }), null)
    assert.equal(parseLayoutNode({ type: 'split', orientation: 'horizontal', children: [] }), null)
  })

  void it('drops a child that is not a layout', () => {
    const parsed = parseLayoutNode({
      type: 'split',
      orientation: 'horizontal',
      sizes: flexSizes(0.5, 0.5),
      children: [widget('help'), { type: 'nonsense' }],
    })

    assert.deepEqual(parsed, widget('help'))
  })

  void it('renormalizes the sizes of the kept children', () => {
    const parsed = parseLayoutNode({
      type: 'split',
      orientation: 'horizontal',
      sizes: flexSizes(0.1, 0.1, 0.8),
      children: [widget('help'), widget('camera'), { type: 'nonsense' }],
    })

    assert.ok(parsed)
    assert.equal(parsed.type, 'split')
    assert.deepEqual(parsed.sizes, flexSizes(0.5, 0.5))
  })
})
