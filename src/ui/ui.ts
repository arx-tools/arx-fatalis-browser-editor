import { ref, watch } from 'vue'

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

// the visibility switches are rendered by the `ToggleSwitch` components (ControlsPanel), driven by
// these refs - the hotkeys below toggle the same refs

/** the geometry itself (the `Mesh` switch): turning it off leaves only the overlays visible */
export const meshVisible = ref(true)

export const wireframeVisible = ref(false)

export const cameraLightVisible = ref(false)

// ------------

/** the little dot next to the flashlight hint: grey when the camera light is off, yellow when on */
const flashlightIndicator = document.querySelector<HTMLElement>('#flashlight-indicator')

function updateFlashlightIndicator(value: boolean): void {
  flashlightIndicator?.classList.toggle('on', value)
}

updateFlashlightIndicator(cameraLightVisible.value)
watch(cameraLightVisible, updateFlashlightIndicator)

export const cameraInfoVisible = ref(true)

export const cameraInfo = document.querySelector<HTMLDivElement>('#camera-info') as HTMLDivElement

// there is no checkbox for this one: it is a "settings" item that stays on all the time (the ref is
// kept so the overlay can be moved under the settings later). The element is hidden by the css while
// it has no text (`:empty`), which keeps the grey box out of the loading screen.
watch(cameraInfoVisible, (value) => {
  cameraInfo.style.display = value ? '' : 'none'
})

// ------------

export const anchorsVisible = ref(false)
export const portalsVisible = ref(false)
export const lightsVisible = ref(false)

// ------------

/**
 * The `lightingCalculatorMode` of the generator (the `.env` key). The URL uses the same key and the
 * select above the canvas is bound to it - the display mode is derived from this on the fly.
 */
export type LightingCalculatorMode =
  | 'MaxBrightness'
  | 'CompleteDarkness'
  | 'Arx'
  | 'Realistic'
  | 'TextureRainbow'

const lightingCalculatorModes: LightingCalculatorMode[] = [
  'Arx',
  'Realistic',
  'TextureRainbow',
  'MaxBrightness',
  'CompleteDarkness',
]

function getLightingCalculatorModeFromUrl(): LightingCalculatorMode {
  const params = new URLSearchParams(globalThis.location.search)
  const requested = params.get('lightingCalculatorMode')
  if (requested !== null && (lightingCalculatorModes as string[]).includes(requested)) {
    return requested as LightingCalculatorMode
  }

  // the legacy `?lighting=` display modes: `flat` was the maximum brightness, the rest was the
  // game-like (`Arx`) look
  if (params.get('lighting') === 'flat') {
    return 'MaxBrightness'
  }

  return 'Arx'
}

export const lightingCalculatorMode = ref<LightingCalculatorMode>(getLightingCalculatorModeFromUrl())

/**
 * A **display only** ambient floor (0..64) for the `Realistic` palette: the baked palette has no
 * ambient (`ambient = 0` in `bakeLlfColors`, like Fred's `DistanceAngleShadowNoTransparency`), so
 * every surface that no light reaches is pitch black. The game's original (Danae) palette has an
 * ambient floor of 23 there, which is why the level never looks fully black in the game - this
 * value makes the editor look the same without changing the exported LLF.
 *
 * `?ambientFloor=12` in the URL; 0 (the default) keeps the exported palette untouched.
 */
function getAmbientFloorFromUrl(): number {
  const raw = Number.parseInt(new URLSearchParams(globalThis.location.search).get('ambientFloor') ?? '0', 10)

  return Number.isNaN(raw) ? 0 : Math.min(127, Math.max(0, raw))
}

/**
 * The discrete steps of the "Minimum light level" slider (the ambient floor of the `Realistic`
 * bake). 0 = no ambient, 23 = the ambient floor of the game's original palette, 127 = the brightest.
 */
export const minimumLightLevels = [0, 11, 23, 34, 50, 67, 83, 100, 127]

export const ambientFloor = ref<number>(getAmbientFloorFromUrl())

/**
 * How close (in game units) two polygon vertices have to be to count as the same point when the
 * editor decides whether a dragged polygon is connected to the ones selected during the drag. The
 * level meshes are not welded: the gaps at the seams are below 0.1 units while the shortest real
 * edge of the shipped levels is around 1.2 units, so 0.25 bridges the seams without letting the
 * selection jump over a thin polygon (`experiments/m3-realistic-lights/vertex-distances.mjs`).
 *
 * It is a plain ref on purpose: a settings input (number/range) can change it at runtime, the
 * selection reads it on every check. Not exposed in the URL.
 */
export const selectionConnectDistance = ref<number>(0.25)

/**
 * True while the `Realistic` lighting calculator runs. The throbber next to the lighting mode select
 * is shown and the shadows switch is disabled, so a second bake cannot be started in the meantime.
 */
export const isComputingLighting = ref<boolean>(false)

/**
 * Whether the `Realistic` bake casts shadows (the Fred `DistanceAngleShadowNoTransparency`
 * occlusion). Off = every light reaches every vertex it faces (the Danae-like look, the game's
 * original palette has no occlusion). `?shadows=0` in the URL; on by default.
 */
export const shadows = ref<boolean>(new URLSearchParams(globalThis.location.search).get('shadows') !== '0')

// the switches, the lighting select and the slider live in the Vue components (ControlsPanel /
// LightingSettings / DownloadDialog); only the url sync stays here
watch(shadows, (value) => {
  const url = new URL(globalThis.location.href)
  if (value) {
    url.searchParams.delete('shadows')
  } else {
    url.searchParams.set('shadows', '0')
  }
  globalThis.history.replaceState(null, '', url)
})

watch(ambientFloor, (value) => {
  const url = new URL(globalThis.location.href)
  if (value === 0) {
    url.searchParams.delete('ambientFloor')
  } else {
    url.searchParams.set('ambientFloor', String(value))
  }
  globalThis.history.replaceState(null, '', url)
})

watch(lightingCalculatorMode, (value) => {
  const url = new URL(globalThis.location.href)
  url.searchParams.set('lightingCalculatorMode', value)
  url.searchParams.delete('lighting')
  globalThis.history.replaceState(null, '', url)
})

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

      case 'KeyM': {
        meshVisible.value = !meshVisible.value
        break
      }

      case 'KeyX': {
        wireframeVisible.value = !wireframeVisible.value
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

/** true after a successful download - shows the green check until the next download starts */
export const downloadCompleted = ref(false)

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
