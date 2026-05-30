import { ref, watch } from 'vue'

type LoadingState = 'idle' | 'loading' | 'fulfilled' | 'rejected'

export const isLoading = ref<LoadingState>('idle')

const crosshair = document.querySelector<HTMLDivElement>('#crosshair') as HTMLDivElement

export const downloadBtn = document.querySelector<HTMLButtonElement>('#download') as HTMLButtonElement
export const loadingIndicator = document.querySelector<HTMLParagraphElement>(
  '#loading-indicator',
) as HTMLParagraphElement

export const mouseLocked = document.querySelector<HTMLParagraphElement>('#mouse-locked') as HTMLParagraphElement
export const mouseUnlocked = document.querySelector<HTMLParagraphElement>('#mouse-unlocked') as HTMLParagraphElement

watch(isLoading, (value) => {
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

loadingIndicator.classList.toggle('hidden', isLoading.value !== 'loading')
downloadBtn.disabled = isLoading.value !== 'fulfilled'

export const canvas = document.querySelector<HTMLCanvasElement>('#screen') as HTMLCanvasElement

mouseLocked.style.display = 'none'
mouseUnlocked.style.display = 'none'

// ------------

export const wireframeVisible = ref(false)

const wireframeVisibleCheckbox = document.querySelector<HTMLInputElement>('#wireframe-visible') as HTMLInputElement
wireframeVisibleCheckbox.addEventListener('input', () => {
  wireframeVisible.value = wireframeVisibleCheckbox.checked
})

watch(wireframeVisible, (value) => {
  wireframeVisibleCheckbox.checked = value
})

wireframeVisibleCheckbox.checked = wireframeVisible.value

// ------------

export const cameraLightVisible = ref(false)

const cameraLightVisibleCheckbox = document.querySelector<HTMLInputElement>('#camera-light-visible') as HTMLInputElement
cameraLightVisibleCheckbox.addEventListener('input', () => {
  cameraLightVisible.value = cameraLightVisibleCheckbox.checked
})

watch(cameraLightVisible, (value) => {
  cameraLightVisibleCheckbox.checked = value
})

cameraLightVisibleCheckbox.checked = cameraLightVisible.value

// ------------

document.addEventListener(
  'keypress',
  (event: KeyboardEvent) => {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- we don't need to cover all keys here
    switch (event.code) {
      case 'KeyF': {
        cameraLightVisible.value = !cameraLightVisible.value
        break
      }

      case 'KeyX': {
        wireframeVisible.value = !wireframeVisible.value
        break
      }
    }
  },
  false,
)

// ------------

export const uiTitle = ref('')

const uiTitleElement = document.querySelector<HTMLHeadingElement>('#title') as HTMLHeadingElement
watch(uiTitle, (value) => {
  uiTitleElement.textContent = value
})

// ------------

export const LeftMouseButton = 1
export const RightMouseButton = 2
export const MiddleMouseButton = 4

export type MouseButton = typeof LeftMouseButton | typeof RightMouseButton | typeof MiddleMouseButton

export const mousePressed: Record<MouseButton, { oldValue: boolean; currentValue: boolean }> = {
  [LeftMouseButton]: { oldValue: false, currentValue: false },
  [RightMouseButton]: { oldValue: false, currentValue: false },
  [MiddleMouseButton]: { oldValue: false, currentValue: false },
}

export function updateMouseButtonState(button: MouseButton, value: boolean): void {
  mousePressed[button] = {
    oldValue: mousePressed[button].currentValue,
    currentValue: value,
  }
}

export function updateMouseButtonStates(event: MouseEvent): void {
  updateMouseButtonState(LeftMouseButton, (event.buttons & LeftMouseButton) > 0)
  updateMouseButtonState(RightMouseButton, (event.buttons & RightMouseButton) > 0)
  updateMouseButtonState(MiddleMouseButton, (event.buttons & MiddleMouseButton) > 0)
}
