import { State } from './State.js'

export const isLoading = new State(false)

export const downloadBtn = document.querySelector<HTMLButtonElement>('#download') as HTMLButtonElement
export const loadingIndicator = document.querySelector<HTMLParagraphElement>(
  '#loading-indicator',
) as HTMLParagraphElement

export const mouseLocked = document.querySelector<HTMLParagraphElement>('#mouse-locked') as HTMLParagraphElement
export const mouseUnlocked = document.querySelector<HTMLParagraphElement>('#mouse-unlocked') as HTMLParagraphElement

isLoading.addEventListener('change', (event: CustomEventInit<{ oldValue: boolean; currentValue: boolean }>) => {
  if (event.detail?.currentValue === true) {
    downloadBtn.disabled = true
    loadingIndicator.style.visibility = 'visible'
  } else {
    downloadBtn.disabled = false
    loadingIndicator.style.visibility = 'hidden'
  }
})

export const canvas = document.querySelector<HTMLCanvasElement>('#screen') as HTMLCanvasElement

mouseLocked.style.display = 'none'
mouseUnlocked.style.display = 'none'

export const wireframeVisible = new State(false)

const wireframeVisibleCheckbox = document.querySelector<HTMLInputElement>('#wireframe-visible') as HTMLInputElement
wireframeVisibleCheckbox.addEventListener('input', () => {
  wireframeVisible.currentValue = wireframeVisibleCheckbox.checked
})
