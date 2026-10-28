<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  cameraFieldNames,
  emptyFields,
  formatPose,
  invalidFields,
  parsePose,
  stepField,
  stepSize,
  syncFields,
  type CameraFieldName,
  type CameraFields,
} from '../../modules/view3d/cameraFields.ts'
import { cameraStore } from '../../modules/view3d/cameraStore.ts'

/**
 * One row of the form: the label on the left and the fields of that row.
 */
interface CameraRow {
  readonly label: string
  readonly fields: readonly CameraFieldName[]
}

/**
 * The text of the inputs.
 *
 * @remarks
 * It is not bound straight to the pose: the camera moves on every mouse move and on every walked step,
 * so a form written from the pose would overwrite a half typed number. The fields follow the pose except
 * the one that holds the focus (see {@link syncFields} and the blur of the form).
 */
const fields = reactive<CameraFields>(emptyFields())

/**
 * The field the user is typing into, if any.
 */
const focused = ref<CameraFieldName>()

/**
 * The two rows, in the order the form shows them.
 */
const rows: readonly CameraRow[] = [
  { label: 'position', fields: cameraFieldNames.slice(0, 3) },
  { label: 'rotation', fields: cameraFieldNames.slice(3) },
]

/**
 * Tells whether there is a camera to move: without a 3D view the form only shows the last pose.
 */
const readOnly = computed(() => {
  return !cameraStore.hasView.value
})

/**
 * The fields that do not hold a number.
 */
const invalid = computed(() => {
  return invalidFields(fields)
})

watch(
  () => {
    return cameraStore.pose.value
  },
  (pose) => {
    if (pose === undefined) {
      return
    }

    Object.assign(fields, syncFields(fields, formatPose(pose), focused.value))
  },
  { immediate: true },
)

/**
 * Applies the form as it is typed, when every field holds a number.
 *
 * @remarks
 * An incomplete form does not move the camera: it keeps the last pose it had, which is what the field
 * snaps back to on blur.
 *
 * @param name The field that changed.
 * @param event The input event of that field.
 */
function onInput(name: CameraFieldName, event: Event): void {
  fields[name] = (event.target as HTMLInputElement).value

  const pose = parsePose(fields)

  if (pose === undefined) {
    return
  }

  cameraStore.moveCamera(pose)
}

/**
 * Takes the focus, selecting the whole value so a new number can be typed right away.
 *
 * @param name The field that got the focus.
 * @param event The focus event of that field.
 */
function onFocus(name: CameraFieldName, event: FocusEvent): void {
  focused.value = name
  ;(event.target as HTMLInputElement).select()
}

/**
 * Gives the focus back: the field shows what the camera really holds.
 *
 * @param name The field that lost the focus.
 */
function onBlur(name: CameraFieldName): void {
  if (focused.value === name) {
    focused.value = undefined
  }

  const pose = cameraStore.pose.value

  if (pose === undefined) {
    return
  }

  // a half typed or a rounded number would stay in the field otherwise
  fields[name] = formatPose(pose)[name]
}

/**
 * Steps one field with the arrow keys: the value is rounded first, then the step is applied.
 *
 * @param name The field to step.
 * @param direction `1` steps up, `-1` steps down.
 */
function onStep(name: CameraFieldName, direction: 1 | -1): void {
  const pose = cameraStore.pose.value
  let fallback = fields[name]

  if (pose !== undefined) {
    fallback = formatPose(pose)[name]
  }

  fields[name] = stepField(fields[name], direction, fallback)

  const stepped = parsePose(fields)

  if (stepped === undefined) {
    return
  }

  cameraStore.moveCamera(stepped)
}

/**
 * Jumps to the spawn of the level: the pose the editor starts with when the url carries no pose.
 */
function onSpawn(): void {
  cameraStore.moveToSpawn()
}
</script>

<template>
  <div class="CameraControlsWidget">
    <div v-for="row in rows" :key="row.label" class="row">
      <span class="label">{{ row.label }}</span>
      <input
        v-for="name in row.fields"
        :key="name"
        :value="fields[name]"
        :class="{ invalid: invalid[name] }"
        :disabled="readOnly || name === 'roll'"
        :aria-label="`${row.label} ${name}`"
        type="number"
        :step="stepSize"
        @input="onInput(name, $event)"
        @focus="onFocus(name, $event)"
        @blur="onBlur(name)"
        @keydown.up.prevent="onStep(name, 1)"
        @keydown.down.prevent="onStep(name, -1)"
      />
    </div>

    <div class="row">
      <span class="label">Jump to:</span>
      <button type="button" :disabled="readOnly" @click="onSpawn">spawn</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

// The camera form: two rows of numbers and the align row. The label holds the left column, so the inputs
// of the two rows start at the same place.
.CameraControlsWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 8px;
  font-size: 13px;

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .label {
    width: 64px;
    color: $text-muted;
  }

  input {
    width: 92px;
    padding: 3px 5px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    font-weight: bold;
  }

  // only an editable field carries the mistake: the read only form shows a missing camera, not a bad one
  input.invalid:not(:disabled) {
    border-color: $danger;
    outline: 1px solid $danger;
  }

  input:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  button {
    padding: 3px 10px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    font-weight: bold;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: $surface-raised;
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
