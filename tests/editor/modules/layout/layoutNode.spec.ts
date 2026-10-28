import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  type LayoutNode,
  collectKinds,
  layoutEquals,
  parseLayoutNode,
} from '../../../../src/editor/modules/layout/layoutNode.ts'
import { defaultLayout } from '../../../../src/editor/modules/layout/layoutPresets.ts'

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
    sizes: children.map(() => {
      return 1 / children.length
    }),
    children,
  }
}

void describe('the default preset', () => {
  void it('gives the 3D view the wider half', () => {
    const root = defaultLayout as Extract<LayoutNode, { type: 'split' }>

    assert.equal(root.orientation, 'horizontal')
    assert.deepEqual(root.sizes, [0.7, 0.3])
    assert.deepEqual(collectKinds(root), ['3d-view', 'map-statistics', 'controls'])
  })
})

void describe('collectKinds', () => {
  void it('gives the kinds of the default layout', () => {
    assert.deepEqual(collectKinds(defaultLayout).toSorted(), ['3d-view', 'controls', 'map-statistics'])
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
    assert.equal(layoutEquals(defaultLayout, defaultLayout), true)
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
    const second = { ...first, sizes: [0.5001, 0.4999] }

    assert.equal(layoutEquals(first, second), true)
  })

  void it('sees a real size change', () => {
    const first = split('horizontal', [widget('help'), widget('camera')])
    const second = { ...first, sizes: [0.7, 0.3] }

    assert.equal(layoutEquals(first, second), false)
  })
})

void describe('parseLayoutNode', () => {
  void it('reads the default layout back', () => {
    const parsed = parseLayoutNode(structuredClone(defaultLayout))

    assert.ok(parsed)
    assert.equal(layoutEquals(parsed, defaultLayout), true)
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
      sizes: [0.5, 0.5],
      children: [widget('help'), { type: 'nonsense' }],
    })

    assert.deepEqual(parsed, widget('help'))
  })

  void it('renormalizes the sizes of the kept children', () => {
    const parsed = parseLayoutNode({
      type: 'split',
      orientation: 'horizontal',
      sizes: [0.1, 0.1, 0.8],
      children: [widget('help'), widget('camera'), { type: 'nonsense' }],
    })

    assert.ok(parsed)
    assert.equal(parsed.type, 'split')
    assert.deepEqual(parsed.sizes, [0.5, 0.5])
  })
})
