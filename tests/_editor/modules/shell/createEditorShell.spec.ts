import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Widget as LuminoWidget } from '@lumino/widgets'
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

  return { shell: createEditorShell(host, definitions), host }
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
