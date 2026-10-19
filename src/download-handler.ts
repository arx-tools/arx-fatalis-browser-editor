/**
 * The export action lives in `main.ts` (it needs the loaded level, the meshes and the lighting
 * settings), but a component must not import `main.ts`: `main.ts` imports `App.vue` and the UI, and
 * that cycle made the module evaluation order depend on the dev server's HMR state.
 *
 * `main.ts` registers its implementation here, the header only calls this function.
 */
type DownloadHandler = () => void

let openHandler: DownloadHandler | undefined

export function registerDownloadHandler(handler: DownloadHandler): void {
  openHandler = handler
}

/** the Download button of the header starts the export */
export function handleDownloadButtonClick(): void {
  openHandler?.()
}
