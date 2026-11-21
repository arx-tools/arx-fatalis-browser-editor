import type { Preview } from '@storybook/vue3-vite'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import '../src/editor/style.scss'

/**
 * The canvas of the stories: the global style of the editor, and the tooltip plugin.
 *
 * @remarks
 * The components are scoped, so their own styles come with them; the global style gives the dark background, the base
 * font and the tooltip theme (the `v-tooltip` of the power switch and the row buttons is a global directive of the
 * app, and a story needs the plugin for it).
 */
const preview: Preview = {
  parameters: {
    layout: 'centered',
  },
  setup(app) {
    app.use(FloatingVue)
  },
}

export default preview
