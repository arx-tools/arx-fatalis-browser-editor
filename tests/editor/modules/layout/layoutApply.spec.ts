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
 * The kinds the harness can build.
 */
const definitions = ['3d-view', 'top-view', 'camera-controls'].map((kind) => {
  return {
    kind,
    label: kind,
    group: 'rendering' as const,
    create: (): InstanceType<typeof Widget> => {
      return new Widget()
    },
  }
})

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

  return { apply, dock, decorated, undecorated }
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

    apply.applyLayout(row(leaf('3d-view'), leaf('top-view')))

    const view = liveOf(dock, '3d-view')
    const plan = liveOf(dock, 'top-view')

    assert.ok(view)
    assert.ok(plan)

    apply.applyLayout(row(leaf('3d-view'), leaf('camera-controls')))

    assert.equal(liveOf(dock, '3d-view'), view)
    assert.equal(view.isDisposed, false)
    assert.equal(plan.isDisposed, true)
    assert.equal(undecorated.has(plan), true)
    assert.equal(undecorated.has(view), false)
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

  void it('disposes every widget when the tree is empty', () => {
    const { apply, dock, undecorated } = buildHarness()

    apply.applyLayout(row(leaf('3d-view'), leaf('top-view')))

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
