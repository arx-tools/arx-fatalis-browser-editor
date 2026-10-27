import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { installDom } from '../../../support/dom.ts'

installDom()

// the dom has to be in place before these modules load (vue and lumino read the document on import)
const { Widget } = await import('@lumino/widgets')
const { createWidget, widgetKind } = await import('../../../../src/editor/modules/layout/widgetDefinition.ts')

void describe('createWidget', () => {
  void it('sets the label and the kind of the widget', () => {
    const widget = createWidget({
      kind: 'statistics',
      label: 'Statistics',
      create: () => {
        return new Widget()
      },
    })

    assert.equal(widget.title.label, 'Statistics')
    assert.equal(widgetKind(widget), 'statistics')
  })

  void it('marks the widget node with the label and the kind', () => {
    const widget = createWidget({
      kind: 'help',
      label: 'Help',
      create: () => {
        return new Widget()
      },
    })

    assert.equal(widget.node.dataset.widget, 'Help')
    assert.equal(widget.node.dataset.widgetKind, 'help')
  })

  void it('calls the factory of the definition once', () => {
    let calls = 0

    const widget = createWidget({
      kind: 'view3d',
      label: '3D View',
      create: () => {
        calls = calls + 1

        return new Widget()
      },
    })

    assert.equal(calls, 1)
    assert.ok(widget.node instanceof HTMLElement)
  })
})

void describe('widgetKind', () => {
  void it('gives back undefined for a widget it did not create', () => {
    assert.equal(widgetKind(new Widget()), undefined)
  })
})
