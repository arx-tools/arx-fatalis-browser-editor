import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Widget as LuminoWidget } from '@lumino/widgets'
import type { WidgetOverlayOptions } from '../../../../src/_editor/modules/layout/layoutEditor.ts'
import { installDom } from '../../../support/dom.ts'

installDom()

// the dom has to be in place before these modules load (vue and lumino read the document on import)
const { DockLayout, Widget } = await import('@lumino/widgets')
const { dockWidgets } = await import('../../../../src/_editor/modules/layout/dockWidgets.ts')
const { createEditorShell } = await import('../../../../src/_editor/modules/shell/createEditorShell.ts')

/**
 * The widget kinds of the test: plain lumino widgets instead of the real (vue) ones.
 */
const definitions = [
  {
    kind: 'statistics',
    label: 'Statistics',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'view3d',
    label: '3D View',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
  {
    kind: 'help',
    label: 'Help',
    create: (): LuminoWidget => {
      return new Widget()
    },
  },
]

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
 * Builds a shell on a host element that is in the document.
 *
 * @returns The shell and its host element.
 */
function buildShell(): {
  shell: ReturnType<typeof createEditorShell>
  host: HTMLElement
} {
  const host = document.createElement('div')
  document.body.append(host)

  return { shell: createEditorShell(host, definitions, mountFakeOverlay), host }
}

void describe('dockWidgets', () => {
  void it('lists the widgets of the dock (the `dock.widgets` getter would be empty)', () => {
    const { shell } = buildShell()
    const widgets = dockWidgets(shell.dock)

    assert.equal(widgets.length, 3)
    assert.deepEqual(
      widgets
        .map((widget) => {
          return widget.title.label
        })
        .toSorted(),
      ['3D View', 'Help', 'Statistics'],
    )
    shell.dispose()
  })
})

void describe('the edit mode of the shell', () => {
  void it('starts locked', () => {
    const { shell } = buildShell()

    assert.equal(shell.isEditing.value, false)
    assert.equal(shell.editor.isUnlocked, false)
    shell.dispose()
  })

  void it('mounts the overlay of every widget when the lock opens', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)

    assert.equal(shell.isEditing.value, true)
    assert.equal(shell.editor.isUnlocked, true)
    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 3)
    shell.dispose()
  })

  void it('closes the edit mode with the escape key', () => {
    const { shell } = buildShell()

    shell.setEditing(true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    assert.equal(shell.isEditing.value, false)
    shell.dispose()
  })

  void it('unmounts the overlays when the lock closes', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)
    shell.setEditing(false)

    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 0)
    shell.dispose()
  })

  void it('decorates a widget added in edit mode', () => {
    const { shell, host } = buildShell()

    shell.setEditing(true)
    shell.addWidget('help')

    assert.equal(host.querySelectorAll('.WidgetOverlay-host').length, 4)
    shell.dispose()
  })
})

void describe('createEditorShell', () => {
  void it('attaches the dock node to the host', () => {
    const { shell, host } = buildShell()

    assert.equal(shell.dock.node.parentElement, host)
    shell.dispose()
  })

  void it('puts the starting layout on the dock as a split', () => {
    const { shell } = buildShell()
    const { layout } = shell.dock

    assert.ok(layout instanceof DockLayout)
    assert.equal(layout.saveLayout().main?.type, 'split-area')
    shell.dispose()
  })

  void it('adds a widget of a known kind', () => {
    const { shell } = buildShell()
    const widget = shell.addWidget('help')

    assert.equal(dockWidgets(shell.dock).length, 4)
    assert.equal(widget.title.label, 'Help')
    shell.dispose()
  })

  void it('refuses an unknown kind', () => {
    const { shell } = buildShell()

    assert.throws(() => {
      shell.addWidget('nope')
    }, /Unknown widget kind: nope/u)
    shell.dispose()
  })

  void it('disposes the widgets of the dock', () => {
    const { shell } = buildShell()
    const widgets = dockWidgets(shell.dock)

    shell.dispose()

    assert.equal(dockWidgets(shell.dock).length, 0)
    assert.ok(
      widgets.every((widget) => {
        return widget.isDisposed
      }),
    )
  })
})
