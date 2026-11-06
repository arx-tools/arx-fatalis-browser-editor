import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

const { DockLayout, DockPanel, Widget } = await import('@lumino/widgets')
const { editorLayout } = await import('../../../../src/editor/modules/layout/layoutPresets.ts')
const { collectKinds, emptyLayout, flexSizes, layoutEquals, lockedBoxOf, lockWidgetTo, parseLayoutNode } =
  await import('../../../../src/editor/modules/layout/layoutNode.ts')
const { toDockConfig, toLayoutNode } = await import('../../../../src/editor/modules/layout/dockConfig.ts')
const { createWidget, widgetKind } = await import('../../../../src/editor/modules/layout/widgetDefinition.ts')

/**
 * The widgets of the test, keyed by their kind.
 */
function makeWidgets(kinds: string[]): Map<string, InstanceType<typeof Widget>> {
  const widgets = new Map<string, InstanceType<typeof Widget>>()

  for (const kind of kinds) {
    widgets.set(
      kind,
      createWidget({
        kind,
        label: kind,
        group: 'rendering',
        create: () => {
          return new Widget()
        },
      }),
    )
  }

  return widgets
}

/**
 * Reads the kind of a widget in the test.
 *
 * @param widget The widget to read.
 *
 * @returns The kind, or `undefined`.
 */
function kindOf(widget: InstanceType<typeof Widget>): string | undefined {
  return widgetKind(widget)
}

/**
 * Builds a dock from a tree.
 *
 * @param kinds The kinds to create.
 *
 * @returns The dock, the widgets and the config that was applied.
 */
function buildDock(kinds: string[]): {
  dock: InstanceType<typeof DockPanel>
  widgets: Map<string, InstanceType<typeof Widget>>
} {
  const host = document.createElement('div')
  document.body.append(host)

  const dock = new DockPanel()
  Widget.attach(dock, host)

  const widgets = makeWidgets(kinds)
  const config = toDockConfig(editorLayout, (kind) => {
    return widgets.get(kind)
  })

  assert.ok(config)
  dock.restoreLayout(config)

  return { dock, widgets }
}

void describe('toLayoutNode', () => {
  void it('reads the dock back into the editor layout', () => {
    const { dock } = buildDock(collectKinds(editorLayout))
    const { layout } = dock

    assert.ok(layout instanceof DockLayout)

    const node = toLayoutNode(layout.saveLayout(), kindOf)

    assert.ok(node)
    assert.deepEqual(collectKinds(node).toSorted(), [
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
    assert.equal(node.type, 'split')
  })

  void it('reads an unparented dock as the empty layout', () => {
    assert.deepEqual(toLayoutNode({ main: null }, kindOf), emptyLayout)
  })

  void it('gives null when the kind of the widget is unknown', () => {
    const widget = new Widget()

    assert.equal(toLayoutNode({ main: { type: 'tab-area', widgets: [widget], currentIndex: 0 } }, kindOf), null)
  })

  void it('drops an unknown widget from a split', () => {
    const known = createWidget({
      kind: 'help',
      label: 'Controls',
      group: 'info',
      create: () => {
        return new Widget()
      },
    })
    const unknown = new Widget()

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            { type: 'tab-area', widgets: [known], currentIndex: 0 },
            { type: 'tab-area', widgets: [unknown], currentIndex: 0 },
          ],
        },
      },
      kindOf,
    )

    assert.deepEqual(node, { type: 'widget', kind: 'help' })
  })
})

void describe('toDockConfig', () => {
  void it('builds the editor layout from its tree', () => {
    const widgets = makeWidgets(collectKinds(editorLayout))
    const config = toDockConfig(editorLayout, (kind) => {
      return widgets.get(kind)
    })

    assert.ok(config)
    assert.equal(config.main?.type, 'split-area')

    const { main } = config
    const root = editorLayout as Extract<typeof editorLayout, { type: 'split' }>

    // the tree holds the size of every child, the config holds the weight of it: the ratios themselves here
    assert.deepEqual(
      main.sizes,
      root.sizes.map((size) => {
        if (size.kind === 'auto') {
          return size.ratio
        }

        return size.px
      }),
    )
    assert.deepEqual(main.children.length, root.children.length)
  })

  void it('gives no config for the empty layout (the dock is cleared instead)', () => {
    const widgets = makeWidgets(['help'])

    assert.equal(
      toDockConfig(emptyLayout, (kind) => {
        return widgets.get(kind)
      }),
      null,
    )
  })

  void it('gives null for a tree without a live widget', () => {
    assert.equal(
      toDockConfig(editorLayout, () => {
        return undefined
      }),
      null,
    )
  })

  void it('collapses a split that lost a child', () => {
    const widgets = makeWidgets(['help'])
    const node = {
      type: 'split' as const,
      orientation: 'horizontal' as const,
      sizes: flexSizes(0.5, 0.5),
      children: [
        { type: 'widget' as const, kind: 'help' },
        { type: 'widget' as const, kind: 'camera' },
      ],
    }

    const config = toDockConfig(node, (kind) => {
      return widgets.get(kind)
    })

    assert.equal(config?.main?.type, 'tab-area')
  })

  void it('keeps the orientation of the tree', () => {
    const widgets = makeWidgets(['statistics', 'help'])
    const node = {
      type: 'split' as const,
      orientation: 'vertical' as const,
      sizes: flexSizes(0.3, 0.7),
      children: [
        { type: 'widget' as const, kind: 'statistics' },
        { type: 'widget' as const, kind: 'help' },
      ],
    }

    const config = toDockConfig(node, (kind) => {
      return widgets.get(kind)
    })

    const main = config?.main

    assert.ok(main)
    assert.equal(main.type, 'split-area')

    const splitMain = main

    assert.equal(splitMain.orientation, 'vertical')
  })
})

void describe('the lock of a widget', () => {
  void it('keeps a pixel size on the node, where the layout reads it', () => {
    const widget = new Widget()

    assert.equal(lockedBoxOf(widget), undefined)

    lockWidgetTo(widget, { width: 400, height: 300 })

    // the two sides of the box are on the node, and the layout reads them back from there
    assert.equal(widget.node.dataset.lockedWidth, '400')
    assert.equal(widget.node.dataset.lockedHeight, '300')
    assert.deepEqual(lockedBoxOf(widget), { width: 400, height: 300 })

    lockWidgetTo(widget, undefined)

    assert.equal(widget.node.dataset.lockedWidth, undefined)
    assert.equal(widget.node.dataset.lockedHeight, undefined)
    assert.equal(lockedBoxOf(widget), undefined)
  })

  void it('reads a locked widget back as a fixed size', () => {
    const widgets = makeWidgets(['a', 'b'])
    const locked = widgets.get('a')
    const free = widgets.get('b')

    if (locked === undefined || free === undefined) {
      throw new Error('the test needs its two widgets')
    }

    lockWidgetTo(locked, { width: 400, height: 300 })

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'vertical',
          sizes: [0.5, 0.5],
          children: [
            { type: 'tab-area', widgets: [locked], currentIndex: 0 },
            { type: 'tab-area', widgets: [free], currentIndex: 0 },
          ],
        },
      },
      widgetKind,
    )

    assert.deepEqual(node, {
      type: 'split',
      orientation: 'vertical',
      sizes: [
        { kind: 'fixed', px: 300 },
        { kind: 'auto', ratio: 1 },
      ],
      children: [
        // the box of the lock goes on the widget too: the splits can carry only the side that is along their axis
        { type: 'widget', kind: 'a', lock: { width: 400, height: 300 } },
        { type: 'widget', kind: 'b' },
      ],
    })
  })

  void it('keeps the whole box of a lock that has no split for one of its sides', () => {
    // the mapper of the painter sits alone in its column: the horizontal split carries its width, and nothing carries
    // its height. Without the box on the widget the height would be lost, and the `fixed` pixels of the split would
    // come back as an `auto` share
    const widgets = makeWidgets(['a', 'b'])
    const locked = widgets.get('a')
    const free = widgets.get('b')

    if (locked === undefined || free === undefined) {
      throw new Error('the test needs its two widgets')
    }

    lockWidgetTo(locked, { width: 400, height: 430 })

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'horizontal',
          sizes: [0.68, 400],
          children: [
            { type: 'tab-area', widgets: [free], currentIndex: 0 },
            { type: 'tab-area', widgets: [locked], currentIndex: 0 },
          ],
        },
      },
      widgetKind,
    )

    assert.deepEqual(node, {
      type: 'split',
      orientation: 'horizontal',
      sizes: [
        // the flexible shares are normalized against each other: one free child is all of the free space
        { kind: 'auto', ratio: 1 },
        { kind: 'fixed', px: 400 },
      ],
      children: [
        { type: 'widget', kind: 'b' },
        { type: 'widget', kind: 'a', lock: { width: 400, height: 430 } },
      ],
    })

    // the stored layout reads the lock back, so a reload can put it on the widget again
    const parsed = parseLayoutNode(node)

    assert.deepEqual(parsed, node)
  })

  void it('reads a lock that is not a box as an unknown layout', () => {
    assert.equal(parseLayoutNode({ type: 'widget', kind: 'a', lock: { width: 0, height: 300 } }), null)
    assert.equal(parseLayoutNode({ type: 'widget', kind: 'a', lock: { width: 400 } }), null)
    assert.equal(parseLayoutNode({ type: 'widget', kind: 'a', lock: 'big' }), null)
    assert.deepEqual(parseLayoutNode({ type: 'widget', kind: 'a', lock: { width: 400, height: 300 } }), {
      type: 'widget',
      kind: 'a',
      lock: { width: 400, height: 300 },
    })
  })

  void it('counts two trees with the same shape as equal, whatever box the widgets carry', () => {
    // the presets spell the lock on the splits only: a tree saved from the dock carries the box too, and the header has
    // to keep the name of the preset
    const withBox = {
      type: 'widget' as const,
      kind: 'a',
      lock: { width: 400, height: 300 },
    }

    assert.equal(layoutEquals(withBox, { type: 'widget', kind: 'a' }), true)
    assert.equal(layoutEquals(withBox, { type: 'widget', kind: 'b' }), false)
  })

  void it('gives a fixed size its pixels as the weight of the config', () => {
    const widgets = makeWidgets(['a', 'b'])
    const config = toDockConfig(
      {
        type: 'split',
        orientation: 'vertical',
        sizes: [
          { kind: 'fixed', px: 300 },
          { kind: 'auto', ratio: 0.4 },
        ],
        children: [
          { type: 'widget', kind: 'a' },
          { type: 'widget', kind: 'b' },
        ],
      },
      (kind) => {
        return widgets.get(kind)
      },
    )

    const main = config?.main

    if (main?.type !== 'split-area') {
      throw new Error('the test expects a split')
    }

    // the plan gives the locked child its pixels and the one flexible child the rest of the space; without a plan
    // the weight of the lock is its size, and the ratio of the only flexible child is normalized to one
    assert.deepEqual(main.sizes, [300, 1])
  })
})

void describe('the lock of a widget in a column', () => {
  void it('fixes the width of the column and the height of the widget', () => {
    const widgets = makeWidgets(['stats', 'other', 'third'])
    const stats = widgets.get('stats')
    const other = widgets.get('other')
    const third = widgets.get('third')

    if (stats === undefined || other === undefined || third === undefined) {
      throw new Error('the test needs its widgets')
    }

    lockWidgetTo(stats, { width: 400, height: 300 })

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'horizontal',
          sizes: [0.5, 0.5],
          children: [
            {
              type: 'split-area',
              orientation: 'vertical',
              sizes: [0.5, 0.5],
              children: [
                { type: 'tab-area', widgets: [stats], currentIndex: 0 },
                { type: 'tab-area', widgets: [other], currentIndex: 0 },
              ],
            },
            { type: 'tab-area', widgets: [third], currentIndex: 0 },
          ],
        },
      },
      widgetKind,
    )

    // the width of the column comes from the lock of the widget inside it, the height from the widget itself
    assert.equal(node?.type, 'split')

    if (node?.type !== 'split') {
      throw new Error('the test expects a split')
    }

    assert.deepEqual(node.sizes[0], { kind: 'fixed', px: 400 })
    assert.deepEqual(node.sizes[1], { kind: 'auto', ratio: 1 })

    const [column] = node.children

    assert.equal(column?.type, 'split')

    if (column?.type !== 'split') {
      throw new Error('the test expects a column')
    }

    assert.deepEqual(column.sizes[0], { kind: 'fixed', px: 300 })
  })
})

void describe('the lock of a widget inside a row', () => {
  void it('fixes the size of the row and its own width, and not the width of the column', () => {
    const widgets = makeWidgets(['camera', 'jump', 'view', 'stats'])
    const camera = widgets.get('camera')
    const jump = widgets.get('jump')
    const view = widgets.get('view')
    const stats = widgets.get('stats')

    if (camera === undefined || jump === undefined || view === undefined || stats === undefined) {
      throw new Error('the test needs its widgets')
    }

    lockWidgetTo(jump, { width: 375, height: 51 })

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'horizontal',
          sizes: [0.6, 0.4],
          children: [
            {
              type: 'split-area',
              orientation: 'vertical',
              sizes: [0.06, 0.94],
              children: [
                {
                  type: 'split-area',
                  orientation: 'horizontal',
                  sizes: [0.6, 0.4],
                  children: [
                    { type: 'tab-area', widgets: [camera], currentIndex: 0 },
                    { type: 'tab-area', widgets: [jump], currentIndex: 0 },
                  ],
                },
                { type: 'tab-area', widgets: [view], currentIndex: 0 },
              ],
            },
            { type: 'tab-area', widgets: [stats], currentIndex: 0 },
          ],
        },
      },
      widgetKind,
    )

    if (node?.type !== 'split') {
      throw new Error('the test expects a split')
    }

    // the width of the middle column is not the width of the row inside it
    assert.deepEqual(node.sizes[0], { kind: 'auto', ratio: 0.6 })

    const [column] = node.children

    if (column?.type !== 'split') {
      throw new Error('the test expects a column')
    }

    // the height of the row is the height of the jump, and the view below it takes the rest
    assert.deepEqual(column.sizes[0], { kind: 'fixed', px: 51 })
    assert.deepEqual(column.sizes[1], { kind: 'auto', ratio: 1 })

    const [row] = column.children

    if (row?.type !== 'split') {
      throw new Error('the test expects a row')
    }

    // and inside the row the jump keeps its own width
    assert.deepEqual(row.sizes[1], { kind: 'fixed', px: 375 })
  })
})

void describe('the shares of a split with a lock', () => {
  void it('grows the shares of the free children to the space the lock leaves', () => {
    const widgets = makeWidgets(['left', 'middle', 'right'])
    const left = widgets.get('left')
    const middle = widgets.get('middle')
    const right = widgets.get('right')

    if (left === undefined || middle === undefined || right === undefined) {
      throw new Error('the test needs its widgets')
    }

    // the right column is locked between two passes: its share is pixels now, so the other two share the rest
    lockWidgetTo(right, { width: 314, height: 300 })

    const node = toLayoutNode(
      {
        main: {
          type: 'split-area',
          orientation: 'horizontal',
          sizes: [0.2, 0.6, 0.2],
          children: [
            { type: 'tab-area', widgets: [left], currentIndex: 0 },
            { type: 'tab-area', widgets: [middle], currentIndex: 0 },
            { type: 'tab-area', widgets: [right], currentIndex: 0 },
          ],
        },
      },
      widgetKind,
    )

    if (node?.type !== 'split') {
      throw new Error('the test expects a split')
    }

    assert.deepEqual(node.sizes[0], { kind: 'auto', ratio: 0.25 })
    const middleSize = node.sizes[1]

    // the sum of the two is one, up to the rounding of the division
    assert.equal(middleSize?.kind, 'auto')

    if (middleSize?.kind !== 'auto') {
      throw new Error('the test expects a share')
    }

    assert.ok(Math.abs(middleSize.ratio - 0.75) < 1e-9)
    assert.deepEqual(node.sizes[2], { kind: 'fixed', px: 314 })
  })
})
