import { createApp } from 'vue'
import WidgetOverlay from './components/WidgetOverlay.vue'
import type { WidgetOverlayOptions } from './modules/layout/layoutEditor.ts'

/**
 * Mounts the overlay of the layout editor with the real Vue component.
 *
 * @remarks
 * The layout module stays free of `.vue` imports, so it can be tested with `node --test`; the app
 * wires the component in here, next to the widget registry (the other `.vue` importer of the root).
 *
 * @param host The element the overlay is mounted into.
 * @param options The label and the remove callback of the overlay.
 *
 * @returns The teardown of the overlay.
 */
export function mountWidgetOverlay(host: HTMLElement, options: WidgetOverlayOptions): () => void {
  const app = createApp(WidgetOverlay, { label: options.label, onRemove: options.onRemove })
  app.mount(host)

  return () => {
    app.unmount()
  }
}
