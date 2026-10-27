import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { WidgetOverlayOptions } from '../../../../src/_editor/modules/layout/layoutEditor.ts'
import { installDom } from '../../../support/dom.ts'

installDom()

const { DockPanel, Widget } = await import('@lumino/widgets')
const { dockWidgets } = await import('../../../../src/_editor/modules/layout/dockWidgets.ts')
const { createWidget } = await import('../../../../src/_editor/modules/layout/widgetDefinition.ts')
const { LayoutEditor } = await import('../../../../src/_editor/modules/layout/layoutEditor.ts')

/**
 * A stand-in for the Vue overlay: it marks the element it is mounted into.
 *
 * @param host The element the overlay is mounted into.
 * @param options The label and the remove callback of the overlay.
 *
 * @returns The teardown of the overlay.
 */
function mountFakeOverlay(host: HTMLElement, options: WidgetOverlayOptions): () => void {
  host.dataset.overlay = options.label

  return () => {
    host.dataset.unmounted = options.label
  }
}

/**
 * Builds an editor on a dock with one widget.
 *
 * @returns The editor, the dock, the container and the decorated widget.
 */
function buildEditor(): {
  editor: InstanceType<typeof LayoutEditor>
  dock: InstanceType<typeof DockPanel>
  container: HTMLElement
  widget: InstanceType<typeof Widget>
} {
  const container = document.createElement('div')
  document.body.append(container)

  const dock = new DockPanel()
  Widget.attach(dock, container)

  const widget = createWidget({
    kind: 'statistics',
    label: 'Statistics',
    create: () => {
      return new Widget()
    },
  })
  dock.addWidget(widget)

  const editor = new LayoutEditor(dock, container, mountFakeOverlay)
  editor.decorate(widget)

  return { editor, dock, container, widget }
}

/**
 * Looks a widget up by the name on its plate.
 *
 * @param dock The dock to search.
 * @param label The text of the plate ('Statistics', 'Help', …).
 *
 * @returns The one with that plate.
 */
function byLabel(dock: InstanceType<typeof DockPanel>, label: string): InstanceType<typeof Widget> {
  const found = dockWidgets(dock).find((widget) => {
    return widget.title.label === label
  })

  assert.ok(found)

  return found
}

/**
 * Reads the overlays of a container.
 *
 * @param container The host element of the dock.
 *
 * @returns The labels of the mounted overlays.
 */
function overlays(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('.WidgetOverlay-host')].map((host) => {
    return host.dataset.overlay ?? '?'
  })
}

void describe('LayoutEditor', () => {
  void it('mounts no overlay while the layout is locked', () => {
    const { editor, container, widget } = buildEditor()

    assert.equal(editor.isUnlocked, false)
    assert.deepEqual(overlays(container), [])
    assert.equal(widget.node.querySelector('.WidgetOverlay-host'), null)
  })

  void it('marks the dock and mounts the overlays in edit mode', () => {
    const { editor, container, widget } = buildEditor()

    editor.setUnlocked(true)

    assert.equal(editor.isUnlocked, true)
    assert.equal(container.classList.contains('is-editing'), true)
    assert.equal(widget.node.querySelector<HTMLElement>('.WidgetOverlay-host')?.dataset.overlay, 'Statistics')
  })

  void it('unmounts the overlays when the mode is closed', () => {
    const { editor, container, widget } = buildEditor()

    editor.setUnlocked(true)
    editor.setUnlocked(false)

    assert.equal(container.classList.contains('is-editing'), false)
    assert.equal(widget.node.querySelector('.WidgetOverlay-host'), null)
    assert.deepEqual(overlays(container), [])
  })

  void it('decorates a widget that arrives while the mode is on', () => {
    const { editor, dock, container } = buildEditor()

    editor.setUnlocked(true)

    const late = createWidget({
      kind: 'help',
      label: 'Help',
      create: () => {
        return new Widget()
      },
    })
    dock.addWidget(late)
    editor.decorate(late)

    assert.deepEqual(overlays(container).toSorted(), ['Help', 'Statistics'])
  })

  void it('removes the widget and its overlay together', () => {
    const { editor, dock, widget } = buildEditor()

    editor.setUnlocked(true)
    editor.removeWidget(widget)

    assert.equal(widget.isDisposed, true)
    assert.equal(widget.node.querySelector('.WidgetOverlay-host'), null)
    assert.equal(editor.isUnlocked, true)

    const { layout } = dock

    assert.notEqual(layout, null)
  })

  void it('marks the widget of the hovered kind and dims the others', () => {
    const { editor, dock } = buildEditor()

    const late = createWidget({
      kind: 'help',
      label: 'Help',
      create: () => {
        return new Widget()
      },
    })
    dock.addWidget(late)
    editor.decorate(late)

    const help = byLabel(dock, 'Help')
    const statistics = byLabel(dock, 'Statistics')

    editor.spotlight('help')

    assert.equal(help.node.classList.contains('is-spotlit'), true)
    assert.equal(help.node.classList.contains('is-dimmed'), false)
    assert.equal(statistics.node.classList.contains('is-dimmed'), true)
    assert.equal(statistics.node.classList.contains('is-spotlit'), false)

    editor.spotlight(null)

    assert.equal(help.node.classList.contains('is-spotlit'), false)
    assert.equal(statistics.node.classList.contains('is-dimmed'), false)
  })

  void it('lights nothing for a kind that is not on the dock', () => {
    const { editor, dock, widget } = buildEditor()

    editor.spotlight('camera')

    assert.equal(widget.node.classList.contains('is-spotlit'), false)
    assert.equal(widget.node.classList.contains('is-dimmed'), true)
    assert.equal(byLabel(dock, 'Statistics').node.classList.contains('is-dimmed'), true)
  })

  void it('clears the spotlight when the mode is closed', () => {
    const { editor, widget } = buildEditor()

    editor.setUnlocked(true)
    editor.spotlight('statistics')
    editor.setUnlocked(false)

    assert.equal(widget.node.classList.contains('is-spotlit'), false)
    assert.equal(widget.node.classList.contains('is-dimmed'), false)
  })

  void it('unmounts every overlay when the editor is disposed', () => {
    const { editor, container, widget } = buildEditor()

    editor.setUnlocked(true)

    const host = widget.node.querySelector<HTMLElement>('.WidgetOverlay-host')

    editor.dispose()

    // the host element is detached, so it is read through the reference the test kept
    assert.equal(host?.dataset.unmounted, 'Statistics')
    assert.deepEqual(overlays(container), [])
  })
})
