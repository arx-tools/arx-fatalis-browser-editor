import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

const { DockLayout, DockPanel, Widget } = await import('@lumino/widgets')
const { ROOT_ZONE_SHARE } = await import('../../../../src/editor/modules/layout/hitTest.ts')
const { placeWidget } = await import('../../../../src/editor/modules/layout/placement.ts')

/**
 * Builds a dock with three widgets in one row.
 *
 * @returns The dock and its widgets, in the order of the row.
 */
function buildDock(): { dock: InstanceType<typeof DockPanel>; widgets: Array<InstanceType<typeof Widget>> } {
  const host = document.createElement('div')
  document.body.append(host)

  const dock = new DockPanel()
  Widget.attach(dock, host)

  const first = new Widget()
  const second = new Widget()
  const third = new Widget()
  dock.addWidget(first)
  dock.addWidget(second, { mode: 'split-right', ref: first })
  dock.addWidget(third, { mode: 'split-right', ref: second })

  return { dock, widgets: [first, second, third] }
}

/**
 * Reads the order of the widgets of a flat dock layout.
 *
 * @param dock The dock to read.
 *
 * @returns The widgets, in the order of the dock.
 */
function order(dock: InstanceType<typeof DockPanel>): Array<InstanceType<typeof Widget>> {
  const { layout } = dock

  assert.ok(layout instanceof DockLayout)

  const { main } = layout.saveLayout()

  assert.ok(main)
  assert.equal(main.type, 'split-area')

  return main.children.map((child) => {
    assert.equal(child.type, 'tab-area')

    return child.widgets[0]
  })
}

void describe('placeWidget', () => {
  void it('does nothing without a target', () => {
    const { dock, widgets } = buildDock()

    placeWidget(dock, widgets[0], null)

    assert.deepEqual(order(dock), widgets)
  })

  void it('moves the widget next to the reference widget', () => {
    const { dock, widgets } = buildDock()

    placeWidget(dock, widgets[0], { mode: 'split-right', ref: widgets[1] })

    assert.deepEqual(order(dock), [widgets[1], widgets[0], widgets[2]])
  })

  void it('takes the whole edge of the dock for a root target', () => {
    const { dock, widgets } = buildDock()

    placeWidget(dock, widgets[0], { mode: 'split-right', ref: null })

    assert.deepEqual(order(dock), [widgets[1], widgets[2], widgets[0]])
  })

  void it('normalizes the share of a root target', () => {
    const { dock, widgets } = buildDock()

    placeWidget(dock, widgets[0], { mode: 'split-left', ref: null })

    const { layout } = dock

    assert.ok(layout instanceof DockLayout)

    const { main } = layout.saveLayout()

    assert.ok(main)
    assert.equal(main.type, 'split-area')
    assert.equal(order(dock)[0], widgets[0])
    assert.ok(Math.abs(main.sizes[0] - ROOT_ZONE_SHARE) < 0.001)
  })
})
