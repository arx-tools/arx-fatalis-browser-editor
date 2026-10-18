/**
 * The selection actions live in `main.ts` (they need the loaded level and the meshes), but the UI
 * (the plain controls of `index.html`, wired in `ui.ts`) must not import `main.ts`: `main.ts`
 * imports `App.vue` and the UI modules, and a cycle made the module evaluation order depend on the
 * dev server's HMR state.
 *
 * `main.ts` registers its implementations here, the UI only calls the functions of this module.
 */
type ClearSelectionHandler = () => void

let clearSelectionHandler: ClearSelectionHandler | undefined

export function registerClearSelection(handler: ClearSelectionHandler): void {
  clearSelectionHandler = handler
}

export function clearSelection(): void {
  clearSelectionHandler?.()
}
