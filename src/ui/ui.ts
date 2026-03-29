import { State } from './State.js'

export const isLoading = new State(false)
export const isWindowFocused = new State(document.hasFocus())

export const downloadBtn = document.querySelector<HTMLButtonElement>('#download') as HTMLButtonElement
export const loadingIndicator = document.querySelector<HTMLParagraphElement>(
  '#loading-indicator',
) as HTMLParagraphElement

isLoading.addEventListener('change', (event: CustomEventInit<{ oldValue: boolean; currentValue: boolean }>) => {
  if (event.detail?.currentValue === true) {
    downloadBtn.disabled = true
    loadingIndicator.style.display = 'block'
  } else {
    downloadBtn.disabled = false
    loadingIndicator.style.display = 'none'
  }
})

export const canvas = document.querySelector<HTMLCanvasElement>('#screen') as HTMLCanvasElement

window.addEventListener('focus', () => {
  isWindowFocused.currentValue = true
})

window.addEventListener('blur', () => {
  isWindowFocused.currentValue = false
})
