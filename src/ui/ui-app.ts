import FloatingVue from 'floating-vue'
import { createApp } from 'vue'
import UIRoot from '../components/ui/UIRoot.vue'

/**
 * The controls under the canvas and the export dialog are Vue components now: they share the
 * `LightingSettings` component (and the `ToggleSwitch`), which a plain html block cannot do. This app
 * renders them through Teleport into the slots of `index.html`, so the static structure of the page
 * (canvas, footer) stays where it is.
 */
export function mountUi(): void {
  const app = createApp(UIRoot)
  app.use(FloatingVue)
  app.mount('#ui-root')
}
