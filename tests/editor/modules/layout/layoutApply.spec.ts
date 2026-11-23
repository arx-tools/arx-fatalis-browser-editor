import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { LayoutNode } from '../../../../src/editor/modules/layout/layoutNode.ts'
import { installDom } from '../../../support/dom.ts'

installDom()

const { DockPanel, Widget } = await import('@lumino/widgets')
const { dockWidgets } = await import('../../../../src/editor/modules/layout/dockWidgets.ts')
const { createLayoutApply } = await import('../../../../src/editor/modules/layout/layoutApply.ts')
const { emptyLayout, flexSizes, lockedBoxOf, lockWidgetTo } =
  await import('../../../../src/editor/modules/layout/layoutNode.ts')
const { widgetKind } = await import('../../../../src/editor/modules/layout/widgetDefinition.ts')

// the pass of the sizes asks for a frame when a layout is applied: the tests read the dock before that frame would
// run, so they do not need it at all
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: () => {
    return 0
  },
  configurable: true,
  writable: true,
})

/**
 * The kinds the harness can build: the three fixed views of the presets, the other three fixed views and two widgets
 * that are not fixed views.
 */
const KINDS = [
  '3d-view',
  'top-view',
  'bottom-view',
  'front-view',
  'back-view',
  'left-view',
  'right-view',
  'camera-controls',
]

/**
 * A leaf of a test layout.
 *
 * @param kind The identifier of the widget kind.
 *
 * @returns The node of the layout.
 */
function leaf(kind: string): LayoutNode {
  return { type: 'widget', kind }
}

/**
 * A horizontal split of the test layouts, with equal shares.
 *
 * @param children The leaves of the row.
 *
 * @returns The split.
 */
function row(...children: LayoutNode[]): LayoutNode {
  return {
    type: 'split',
    orientation: 'horizontal',
    sizes: flexSizes(
      ...children.map(() => {
        return 1 / children.length
      }),
    ),
    children,
  }
}

/**
 * A dock with the harness of the layout pass around it.
 */
type Harness = {
  readonly apply: ReturnType<typeof createLayoutApply>
  readonly dock: InstanceType<typeof DockPanel>
  readonly decorated: Set<InstanceType<typeof Widget>>
  readonly undecorated: Set<InstanceType<typeof Widget>>
  readonly created: string[]
}

/**
 * Builds a host, a dock and the layout pass over them.
 *
 * @returns The harness the tests read.
 */
function buildHarness(): Harness {
  const host = document.createElement('div')

  host.style.width = '1200px'
  host.style.height = '800px'
  document.body.append(host)

  // jsdom has no layout: the pass needs a host that has a size, or it skips the plan
  host.getBoundingClientRect = (): DOMRect => {
    return new DOMRect(0, 0, 1200, 800)
  }

  const dock = new DockPanel()

  Widget.attach(dock, host)

  const decorated = new Set<InstanceType<typeof Widget>>()
  const undecorated = new Set<InstanceType<typeof Widget>>()
  const created: string[] = []
  const definitions = KINDS.map((kind) => {
    return {
      kind,
      label: kind,
      group: 'rendering' as const,
      create: (): InstanceType<typeof Widget> => {
        created.push(kind)

        return new Widget()
      },
    }
  })

  const apply = createLayoutApply({
    dock,
    host,
    definitions,
    decorate: (widget) => {
      decorated.add(widget)
    },
    undecorate: (widget) => {
      decorated.delete(widget)
      undecorated.add(widget)
    },
    isDragActive: () => {
      return false
    },
    refreshOverlays: () => {
      // the overlays of the edit mode are not part of this test
    },
    syncLayout: () => {
      // the persisted layout is not part of this test
    },
  })

  return { apply, dock, decorated, undecorated, created }
}

/**
 * Finds the live widget of a kind on the dock.
 *
 * @param dock The dock to read.
 * @param kind The kind to look for.
 *
 * @returns The widget, or `undefined` when it is not on the dock.
 */
function liveOf(dock: InstanceType<typeof DockPanel>, kind: string): InstanceType<typeof Widget> | undefined {
  return dockWidgets(dock).find((widget) => {
    return widgetKind(widget) === kind
  })
}

void describe('applyLayout', () => {
  void it('keeps the widgets the new tree has a place for, and drops the rest', () => {
    const { apply, dock, undecorated } = buildHarness()

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    const view = liveOf(dock, '3d-view')
    const camera = liveOf(dock, 'camera-controls')

    assert.ok(view)
    assert.ok(camera)

    apply.applyLayout(row(leaf('3d-view'), leaf('top-view')))

    assert.equal(liveOf(dock, '3d-view'), view)
    assert.equal(view.isDisposed, false)
    assert.equal(camera.isDisposed, true)
    assert.equal(undecorated.has(camera), true)
    assert.equal(undecorated.has(view), false)
  })

  void it('keeps a fixed view for the next layout that has it', () => {
    const { apply, dock } = buildHarness()

    apply.applyLayout(row(leaf('3d-view'), leaf('left-view')))

    const left = liveOf(dock, 'left-view')

    assert.ok(left)

    apply.applyLayout(row(leaf('3d-view'), leaf('top-view')))

    // the layout does not show it, but it waits off the dock with its renderer
    assert.equal(liveOf(dock, 'left-view'), undefined)
    assert.equal(left.isDisposed, false)

    apply.applyLayout(row(leaf('3d-view'), leaf('left-view')))

    assert.equal(liveOf(dock, 'left-view'), left)
  })

  void it('creates the widgets the tree has and the dock does not', () => {
    const { apply, dock, decorated } = buildHarness()

    apply.applyLayout(row(leaf('3d-view')))

    const view = liveOf(dock, '3d-view')

    assert.ok(view)

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    const camera = liveOf(dock, 'camera-controls')

    assert.ok(camera)
    assert.notEqual(camera, view)
    assert.equal(decorated.has(camera), true)
    assert.equal(liveOf(dock, '3d-view'), view)
  })

  void it('prepares the fixed views of the factory presets, and not the others', () => {
    const { apply, dock, created } = buildHarness()

    apply.applyLayout(row(leaf('3d-view')))
    apply.prepareWidgets()

    // the three fixed views of the factory presets are ready; the bottom, back and right ones are not built
    assert.deepEqual(created.toSorted(), ['3d-view', 'front-view', 'left-view', 'top-view'])

    // the first layout that has the left view takes the prepared one, and does not build a second
    const before = created.length

    apply.applyLayout(row(leaf('3d-view'), leaf('left-view')))

    assert.equal(created.length, before)
    assert.ok(liveOf(dock, 'left-view'))
  })

  void it('clears the lock the new tree does not keep', () => {
    const { apply, dock } = buildHarness()

    apply.applyLayout(row(leaf('3d-view')))

    const view = liveOf(dock, '3d-view')

    assert.ok(view)
    lockWidgetTo(view, { width: 350, height: 200 })
    assert.deepEqual(lockedBoxOf(view), { width: 350, height: 200 })

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    assert.equal(liveOf(dock, '3d-view'), view)
    assert.equal(lockedBoxOf(view), undefined)
  })

  void it('keeps the node of a widget the new tree has', () => {
    const { apply, dock } = buildHarness()

    apply.applyLayout(row(leaf('3d-view')))

    const view = liveOf(dock, '3d-view')

    assert.ok(view)

    const { node } = view

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    assert.equal(view.node, node)
    assert.equal(document.contains(node), true)
  })

  void it('disposes every widget that is not a fixed view when the tree is empty', () => {
    const { apply, dock, undecorated } = buildHarness()

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    const widgets = dockWidgets(dock)

    assert.equal(widgets.length, 2)

    apply.applyLayout(emptyLayout)

    assert.equal(dockWidgets(dock).length, 0)

    assert.deepEqual(
      widgets.map((widget) => {
        return widget.isDisposed
      }),
      [true, true],
    )
    assert.equal(
      widgets.every((widget) => {
        return undecorated.has(widget)
      }),
      true,
    )
  })

  void it('disposes the widgets that wait off the dock when the shell goes', () => {
    const { apply, dock, created } = buildHarness()

    apply.applyLayout(row(leaf('3d-view')))
    apply.prepareWidgets()
    apply.disposeReady()

    // the left view was prepared, then thrown away: the next layout builds a new one
    apply.applyLayout(row(leaf('3d-view'), leaf('left-view')))

    assert.equal(
      created.filter((kind) => {
        return kind === 'left-view'
      }).length,
      2,
    )
    assert.ok(liveOf(dock, 'left-view'))
  })

  void it('writes the locks of the tree on the widgets', () => {
    const { apply, dock } = buildHarness()
    const locked: LayoutNode = {
      type: 'split',
      orientation: 'horizontal',
      sizes: [
        { kind: 'fixed', px: 350 },
        { kind: 'auto', ratio: 1 },
      ],
      children: [
        {
          type: 'split',
          orientation: 'vertical',
          sizes: [
            { kind: 'fixed', px: 300 },
            { kind: 'auto', ratio: 1 },
          ],
          children: [leaf('3d-view'), leaf('camera-controls')],
        },
        leaf('top-view'),
      ],
    }

    apply.applyLayout(locked)

    const view = liveOf(dock, '3d-view')

    assert.ok(view)
    assert.deepEqual(lockedBoxOf(view), { width: 350, height: 300 })
  })
})
