import { State } from './State.js'

type LoadingState = 'idle' | 'loading' | 'fulfilled' | 'rejected'

export const isLoading = new State<LoadingState>('idle')

const crosshair = document.querySelector<HTMLDivElement>('#crosshair') as HTMLDivElement

export const downloadBtn = document.querySelector<HTMLButtonElement>('#download') as HTMLButtonElement
export const loadingIndicator = document.querySelector<HTMLParagraphElement>(
  '#loading-indicator',
) as HTMLParagraphElement

export const mouseLocked = document.querySelector<HTMLParagraphElement>('#mouse-locked') as HTMLParagraphElement
export const mouseUnlocked = document.querySelector<HTMLParagraphElement>('#mouse-unlocked') as HTMLParagraphElement

isLoading.addEventListener('change', (event: CustomEventInit<{ oldValue: boolean; currentValue: LoadingState }>) => {
  const value = event.detail?.currentValue as LoadingState

  loadingIndicator.classList.toggle('hidden', value === 'idle' || value === 'fulfilled')
  loadingIndicator.classList.toggle('error', value === 'rejected')

  if (value === 'loading') {
    loadingIndicator.textContent = 'Loading, please wait...'
  } else if (value === 'rejected') {
    loadingIndicator.textContent = 'An error occurred, see logs for details!'
  }

  downloadBtn.disabled = value !== 'fulfilled'

  crosshair.classList.toggle('hidden', value === 'loading')
})

loadingIndicator.classList.toggle('hidden', isLoading.currentValue !== 'loading')
downloadBtn.disabled = isLoading.currentValue !== 'fulfilled'

export const canvas = document.querySelector<HTMLCanvasElement>('#screen') as HTMLCanvasElement

mouseLocked.style.display = 'none'
mouseUnlocked.style.display = 'none'

// ------------

export const wireframeVisible = new State(false)

const wireframeVisibleCheckbox = document.querySelector<HTMLInputElement>('#wireframe-visible') as HTMLInputElement
wireframeVisibleCheckbox.addEventListener('input', () => {
  wireframeVisible.currentValue = wireframeVisibleCheckbox.checked
})

wireframeVisible.addEventListener('change', (event: CustomEventInit<{ oldValue: boolean; currentValue: boolean }>) => {
  wireframeVisibleCheckbox.checked = event.detail?.currentValue ?? false
})

wireframeVisibleCheckbox.checked = wireframeVisible.currentValue

// ------------

export const cameraLightVisible = new State(false)

const cameraLightVisibleCheckbox = document.querySelector<HTMLInputElement>('#camera-light-visible') as HTMLInputElement
cameraLightVisibleCheckbox.addEventListener('input', () => {
  cameraLightVisible.currentValue = cameraLightVisibleCheckbox.checked
})

cameraLightVisible.addEventListener(
  'change',
  (event: CustomEventInit<{ oldValue: boolean; currentValue: boolean }>) => {
    cameraLightVisibleCheckbox.checked = event.detail?.currentValue ?? false
  },
)

cameraLightVisibleCheckbox.checked = cameraLightVisible.currentValue

// ------------

document.addEventListener(
  'keypress',
  (event: KeyboardEvent) => {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- we don't need to cover all keys here
    switch (event.code) {
      case 'KeyF': {
        cameraLightVisible.currentValue = !cameraLightVisible.currentValue
        break
      }

      case 'KeyX': {
        wireframeVisible.currentValue = !wireframeVisible.currentValue
        break
      }
    }
  },
  false,
)

// ------------

export const uiTitle = new State('')

const uiTitleElement = document.querySelector<HTMLHeadingElement>('#title') as HTMLHeadingElement
uiTitle.addEventListener('change', (event: CustomEventInit<{ oldValue: string; currentValue: string }>) => {
  uiTitleElement.textContent = event.detail?.currentValue ?? ''
})
