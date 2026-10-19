import { downloadSettings, type DownloadSettings } from './ui/download-state.js'

/**
 * The export action lives in `main.ts` (it needs the loaded level, the meshes and the lighting
 * settings), but a component must not import `main.ts`: `main.ts` imports `App.vue` and the UI, and
 * that cycle made the module evaluation order depend on the dev server's HMR state.
 *
 * `main.ts` registers its implementations here, the components only call these functions.
 */
type DownloadHandler = () => void
type ExportHandler = (settings: DownloadSettings) => void

let openHandler: DownloadHandler | undefined
let exportHandler: ExportHandler | undefined

export function registerDownloadHandler(handler: DownloadHandler): void {
  openHandler = handler
}

/** the Download button of the header opens the export dialog */
export function handleDownloadButtonClick(): void {
  openHandler?.()
}

export function registerExportLevel(handler: ExportHandler): void {
  exportHandler = handler
}

/** the Export button of the dialog starts the export with the settings of the dialog */
export function exportLevel(): void {
  exportHandler?.({ ...downloadSettings })
}
