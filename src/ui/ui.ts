import { ref, watch, type Ref } from 'vue'

type LoadingState = 'idle' | 'loading' | 'fulfilled' | 'rejected'

export const isLoading = ref<LoadingState>('idle')

const crosshair = document.querySelector<HTMLDivElement>('#crosshair') as HTMLDivElement

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

  crosshair.classList.toggle('hidden', value === 'loading')
})

loadingIndicator.classList.toggle('hidden', isLoading.value !== 'loading')

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

export const cameraInfoVisible = ref(true)

export const cameraInfo = document.querySelector<HTMLDivElement>('#camera-info') as HTMLDivElement

const cameraInfoVisibleCheckbox = document.querySelector<HTMLInputElement>(
  '#camera-info-visible',
) as HTMLInputElement
cameraInfoVisibleCheckbox.addEventListener('input', () => {
  cameraInfoVisible.value = cameraInfoVisibleCheckbox.checked
})

watch(cameraInfoVisible, (value) => {
  cameraInfoVisibleCheckbox.checked = value
  cameraInfo.style.display = value ? 'block' : 'none'
})

cameraInfoVisibleCheckbox.checked = cameraInfoVisible.value
cameraInfo.style.display = cameraInfoVisible.value ? 'block' : 'none'

// ------------

/** binds a plain visibility checkbox to a ref (the component reads the ref) */
function bindCheckbox(id: string): Ref<boolean> {
  const checkbox = document.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement
  const visible = ref(false)

  checkbox.addEventListener('input', () => {
    visible.value = checkbox.checked
  })

  watch(visible, (value) => {
    checkbox.checked = value
  })

  checkbox.checked = visible.value

  return visible
}

export const anchorsVisible = bindCheckbox('anchors-visible')
export const portalsVisible = bindCheckbox('portals-visible')
export const lightsVisible = bindCheckbox('lights-visible')

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

      case 'KeyP': {
        cameraInfoVisible.value = !cameraInfoVisible.value
        break
      }

      // the three overlay hotkeys sit next to each other on both the english and the hungarian
      // layouts (event.code is the physical key, not the character)
      case 'KeyJ': {
        anchorsVisible.value = !anchorsVisible.value
        break
      }

      case 'KeyK': {
        portalsVisible.value = !portalsVisible.value
        break
      }

      case 'KeyL': {
        lightsVisible.value = !lightsVisible.value
        break
      }
    }
  },
  false,
)

// ------------

/** the level that is currently loaded (set by main.ts after the url validation) */
export const currentLevelId = ref<number | undefined>(undefined)

/** true when the mesh has been changed since the level was loaded - used by the level switcher */
export const isDirty = ref(false)

/** 0..100 while the download runs, driven by the download steps */
export const downloadProgress = ref(0)

/** true only while `handleDownloadButtonClick` is running (the level load also uses `isLoading`) */
export const isDownloading = ref(false)

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
