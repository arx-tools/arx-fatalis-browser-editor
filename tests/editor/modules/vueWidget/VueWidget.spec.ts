import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { VNode } from 'vue'
import { installDom } from '../../../support/dom.ts'

installDom()

// the dom has to be in place before these modules load (vue and lumino read the document on import)
const { defineComponent, h, onUnmounted } = await import('vue')
const { VueWidget } = await import('../../../../src/editor/modules/vueWidget/VueWidget.ts')

/**
 * A component with a render function: the tests can not import a single file component (node's type
 * stripping does not compile `.vue`), so the render function stands in for one.
 */
const Greeting = defineComponent({
  props: {
    name: {
      type: String,
      required: true,
    },
  },
  render() {
    return h('p', { class: 'greeting' }, `hello ${this.name}`)
  },
})

void describe('VueWidget', () => {
  void it('mounts the component into the content element of the widget node', () => {
    const widget = new VueWidget(Greeting, { name: 'world' })

    assert.equal(widget.node.querySelector(':scope > .VueWidget-content .greeting')?.textContent, 'hello world')
    widget.dispose()
  })

  void it('mounts into a content element, so the widget node stays free for the overlay', () => {
    const widget = new VueWidget(Greeting, { name: 'world' })
    const content = widget.node.querySelector(':scope > .VueWidget-content')

    assert.equal(content?.className, 'VueWidget-content')
    assert.equal(content?.parentElement, widget.node)
    assert.equal(widget.node.querySelector(':scope > .VueWidget-content .greeting')?.parentElement, content)
    widget.dispose()
  })

  void it('unmounts the component when the widget is disposed', () => {
    let unmounted = false

    const Tracked = defineComponent({
      setup() {
        onUnmounted(() => {
          unmounted = true
        })

        return (): VNode => {
          return h('span', 'tracked')
        }
      },
    })

    const widget = new VueWidget(Tracked)
    widget.dispose()

    assert.equal(unmounted, true)
    assert.equal(widget.isDisposed, true)
  })
})
