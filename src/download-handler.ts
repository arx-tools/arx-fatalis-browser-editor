/**
 * The download action lives in `main.ts` (it needs the loaded level, the meshes and the lighting
 * settings), but a component must not import `main.ts`: `main.ts` imports `App.vue`, and that cycle
 * made the module evaluation order depend on the dev server's HMR state - after an edit the page
 * could fail with "Cannot access 'App' before initialization" even on a hard reload.
 *
 * `main.ts` registers the handler here, the component only imports this module, so there is no
 * cycle.
 */
type DownloadHandler = () => Promise<void>

let downloadHandler: DownloadHandler | undefined

export function registerDownloadHandler(handler: DownloadHandler): void {
  downloadHandler = handler
}

export async function handleDownloadButtonClick(): Promise<void> {
  if (downloadHandler === undefined) {
    return
  }

  await downloadHandler()
}
