import { persistedRef } from './persistedRef/persistedRef.ts'

/**
 * The state of the editor: every value which survives a reload lives here, so the modules only ask
 * for the ref and never touch the url or the storage themselves.
 *
 * @remarks
 * - the persistence of a value is one config object: `persistInLocalStorage`, `persistInUrl`, the
 * default value and the optional `throttle`/`debounce`
 * - a value which is not persisted is a plain `ref()` and does not belong here
 */

/**
 * The minified state of the debug panel's payload (the `Minify`/`Format` button).
 */
export const debugPanelMinified = persistedRef({
  key: 'debugPanelMinified',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * The tab which is in front in the debug panel: `selection` or `anchor`.
 *
 * @remarks
 * - a plain string for now: the debug panel will be reworked, and only then will it get its own
 * `DebugTabId` type again
 */
export const debugPanelActiveTab = persistedRef({
  key: 'debugPanelActiveTab',
  defaultValue: 'selection',
  persistInLocalStorage: true,
})
