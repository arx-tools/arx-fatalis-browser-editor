import { Widget } from '@lumino/widgets'
import { createApp, type App, type Component } from 'vue'

/**
 * A lumino widget whose content is a Vue component.
 *
 * The widget owns the Vue app: the component is mounted into a content element of the widget node
 * (never into the node itself, because the layout editor later appends its overlay next to it), and
 * the app is unmounted when the widget is disposed, so a widget that leaves the dock leaks nothing.
 *
 * The content element gets the `VueWidget-content` class: the scoped styles of the component fill it,
 * and the global stylesheet only gives it the full height of the widget.
 */
export class VueWidget extends Widget {
  private readonly app: App

  /**
   * Mounts the component into a fresh content element of the widget node.
   *
   * @param component The Vue component to render.
   * @param props The props of the component.
   */
  constructor(component: Component, props: Record<string, unknown> = {}) {
    super()
    this.addClass('VueWidget')

    const content = document.createElement('div')
    content.className = 'VueWidget-content'
    this.node.append(content)

    this.app = createApp(component, props)
    this.app.mount(content)
  }

  /**
   * Unmounts the component, so the widget does not leave a live Vue app behind.
   */
  override dispose(): void {
    this.app.unmount()
    super.dispose()
  }
}
