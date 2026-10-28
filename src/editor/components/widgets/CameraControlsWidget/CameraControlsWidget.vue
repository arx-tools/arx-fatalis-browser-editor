<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { cameraStore } from '../cameraStore.ts'
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
} from './cameraFields.ts'

/**
 * One group of the form: a label and the fields that belong together.
 *
 * @remarks
 * The groups are inline boxes, so a wide widget puts all of them in one line — and the widget can be
 * squeezed into a single strip — while a narrow one wraps them, and a group never breaks apart.
 */
interface CameraGroup {
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
 * The groups, in the order the form shows them.
 */
const groups: readonly CameraGroup[] = [
  { label: 'Position', fields: cameraFieldNames.slice(0, 3) },
  { label: 'Rotation', fields: cameraFieldNames.slice(3) },
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

// the walkable view hides its HUD while this form is on the dock, so it has to know that we are here
onMounted(() => {
  widgetPresence.register(WIDGET_KINDS.cameraControls)
})

onBeforeUnmount(() => {
  widgetPresence.unregister(WIDGET_KINDS.cameraControls)
})

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
    <div class="fields">
      <span v-for="group in groups" :key="group.label" class="group">
        <span class="label">{{ group.label }}</span>
        <input
          v-for="name in group.fields"
          :key="name"
          :value="fields[name]"
          :class="{ invalid: invalid[name] }"
          :disabled="readOnly || name === 'roll'"
          :aria-label="`${group.label} ${name}`"
          type="number"
          :step="stepSize"
          @input="onInput(name, $event)"
          @focus="onFocus(name, $event)"
          @blur="onBlur(name)"
          @keydown.up.prevent="onStep(name, 1)"
          @keydown.down.prevent="onStep(name, -1)"
        />
      </span>

      <span class="group">
        <span class="label">Jump to:</span>
        <button type="button" :disabled="readOnly" @click="onSpawn">spawn</button>
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The camera form: the fields are inline groups, so a wide widget shows them in one line (and the widget
// can be a thin strip above the 3D view — the dock reads the min height of the widget from the css). A
// narrow widget wraps the groups, and a group never breaks apart.
.CameraControlsWidget {
  height: 100%;
  padding: 8px;
  overflow: auto;
  font-size: 13px;

  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
  }

  .group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .label {
    color: $text-muted;
    white-space: nowrap;
  }

  input {
    width: 88px;
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
