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

createApp(App).use(FloatingVue).mount('#app')
