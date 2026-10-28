/**
 * The entry point of the new shell.
 *
 * The old app is archived under `src/_old/` (it is not built and not typechecked); this module mounts
 * the shell of the dock based editor. Everything below `src/editor/` is the new editor; the shared
 * `src/generator/` modules stay where they are.
 */

import { createApp } from 'vue'
import FloatingVue from 'floating-vue'
import 'floating-vue/dist/style.css'
import App from './App.vue'
import './style.scss'

/**
 * The part of the floating-vue config the editor overrides.
 *
 * @remarks
 * The package types its options as `any`, so the one field the editor touches is named here.
 */
interface TooltipThemeOptions {
  themes: Record<string, { triggers: string[] }>
}

// A tooltip shows on hover only: floating-vue would also show it on `focus`, and a button that keeps the
// focus brings its tooltip back when the browser tab is activated again — it then stays there until the
// pointer happens to cross the button (the bug the owner reported on 2026-10-28). The global default is
// the one place to say it, so every `v-tooltip` of the editor follows it.
const floatingVueOptions = FloatingVue.options as TooltipThemeOptions

floatingVueOptions.themes.tooltip.triggers = ['hover']

createApp(App).use(FloatingVue).mount('#app')
