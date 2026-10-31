import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

const { DockLayout, DockPanel, Widget } = await import('@lumino/widgets')
const { editorLayout } = await import('../../../../src/editor/modules/layout/layoutPresets.ts')
const { collectKinds, toDockConfig, toLayoutNode } = await import('../../../../src/editor/modules/layout/layoutNode.ts')
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
      'controls',
      'front-view',
      'jump-to-location',
      'left-view',
      'map-statistics',
      'polygon-inspector',
      'top-view',
    ])
    assert.equal(node.type, 'split')
  })

  void it('gives null for an empty config', () => {
    assert.equal(toLayoutNode({ main: null }, kindOf), null)
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

    assert.deepEqual(main.sizes, root.sizes)
    assert.deepEqual(main.children.length, root.children.length)
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
      sizes: [0.5, 0.5],
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
      sizes: [0.3, 0.7],
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
