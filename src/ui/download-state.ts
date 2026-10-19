import { reactive, ref } from 'vue'
import type { LightingCalculatorMode } from './ui.js'

/** the settings the export dialog starts with (the display settings, but the user can change them) */
export type DownloadSettings = {
  mode: LightingCalculatorMode
  ambientFloor: number
  shadows: boolean
}

export const downloadSettings = reactive<DownloadSettings>({
  mode: 'Arx',
  ambientFloor: 0,
  shadows: true,
})

/** the summary line of the export dialog ("Level 4: 3 polygons deleted, ...") */
export const downloadSummary = ref('')

export function closeDownloadDialog(): void {
  document.querySelector<HTMLDialogElement>('#download-dialog')?.close()
}
