/**
 * The entry point of the new shell.
 *
 * The old app is archived under `src/_old/` (it is not built and not typechecked); this module mounts
 * the shell of the dock based editor. Everything below `src/_editor/` is the new editor; the shared
 * `src/_generator/` modules stay where they are.
 */

import { createApp } from 'vue'
import App from './App.vue'
import './style.scss'

createApp(App).mount('#app')
