import { reactive, ref } from 'vue'

/**
 * The camera dialog: the six values of the position/rotation overlay in a small form over the
 * canvas. Typing into a field moves the camera immediately, so a view can be reproduced exactly
 * without flying there with the mouse (a test can not steer the camera either).
 */
export type CameraFieldName = 'x' | 'y' | 'z' | 'pitch' | 'yaw' | 'roll'

export type CameraFields = Record<CameraFieldName, string>

export type CameraValues = {
  position: { x: number; y: number; z: number }
  angle: { pitch: number; yaw: number; roll: number }
}

export const cameraDialogVisible = ref(false)

/** the raw text of the inputs (a number input keeps the invalid text too, so it can be corrected) */
export const cameraFields = reactive<CameraFields>({
  x: '',
  y: '',
  z: '',
  pitch: '',
  yaw: '',
  roll: '',
})

/** the field names in the tab order */
export const cameraFieldNames: CameraFieldName[] = ['x', 'y', 'z', 'pitch', 'yaw', 'roll']

/** the values the dialog was opened with, used while a field is invalid */
let lastValidValues: CameraValues | undefined

/** parses one field; `undefined` when it is not a finite number */
export function parseCameraField(value: string): number | undefined {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** all six fields, or `undefined` when any of them is invalid */
export function readCameraValues(): CameraValues | undefined {
  const numbers = cameraFieldNames.map((name) => parseCameraField(cameraFields[name]))

  if (numbers.some((value) => value === undefined)) {
    return undefined
  }

  const [x, y, z, pitch, yaw, roll] = numbers as number[]

  return { position: { x, y, z }, angle: { pitch, yaw, roll } }
}

export type CameraAlignMode = 'top' | 'front' | 'left'

/** set by main.ts: fits the camera to the anchor graph of the level (`top` / `front` / `left`) */
export const alignCameraTo = ref<((mode: CameraAlignMode) => void) | undefined>(undefined)

/** set by main.ts: moves the camera, called on every valid edit */
export const applyCameraValues = ref<((values: CameraValues) => void) | undefined>(undefined)

/** fills the form, called by main.ts when the dialog opens */
export function openCameraDialog(values: CameraValues): void {
  lastValidValues = values

  cameraFields.x = values.position.x.toFixed(2)
  cameraFields.y = values.position.y.toFixed(2)
  cameraFields.z = values.position.z.toFixed(2)
  cameraFields.pitch = values.angle.pitch.toFixed(2)
  cameraFields.yaw = values.angle.yaw.toFixed(2)
  cameraFields.roll = values.angle.roll.toFixed(2)

  cameraDialogVisible.value = true
}

/** called by the component on every `input` event: applies the values when they are all valid */
export function commitCameraFields(): void {
  const values = readCameraValues()

  if (values === undefined) {
    return
  }

  lastValidValues = values
  applyCameraValues.value?.(values)
}

/** the values the camera keeps while a field is invalid */
export function getLastValidCameraValues(): CameraValues | undefined {
  return lastValidValues
}
