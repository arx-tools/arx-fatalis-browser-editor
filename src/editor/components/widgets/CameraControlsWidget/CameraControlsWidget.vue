<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { cameraStore } from '../cameraStore.ts'
import {
  cameraFieldGroups,
  cameraFieldLabels,
  emptyFields,
  formatPose,
  invalidFields,
  parsePose,
  stepField,
  syncFields,
  type CameraFieldName,
  type CameraFields,
} from './cameraFields.ts'

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
</script>

<template>
  <div class="CameraControlsWidget">
    <div class="fields">
      <div v-for="group in cameraFieldGroups" :key="group.label" class="group">
        <label v-for="name in group.fields" :key="name" class="field">
          <span class="caption">{{ cameraFieldLabels[name] }}</span>
          <input
            :value="fields[name]"
            :class="{ invalid: invalid[name] }"
            :disabled="readOnly || name === 'roll'"
            :aria-label="`${group.label} ${name}`"
            :title="`${group.label} ${name}`"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            spellcheck="false"
            @input="onInput(name, $event)"
            @focus="onFocus(name, $event)"
            @blur="onBlur(name)"
            @keydown.up.prevent="onStep(name, 1)"
            @keydown.down.prevent="onStep(name, -1)"
          />
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The camera form: the fields are inline cells, so a wide widget shows them in one line (and the widget
// can be a thin strip above the 3D view — the dock reads the min height of the widget from the css). A
// narrow widget wraps the two groups, and a group never breaks apart. The caption is above the input and
// not beside it: six captions in the row would not fit in the 36% the Advanced preset gives to the form.
.CameraControlsWidget {
  // the widget is its own container, so the rule below can ask how much room *this* element has, not the
  // window: only the width matters here, hence the inline size
  container-type: inline-size;
  display: flex;
  height: 100%;
  padding: 4px;
  overflow: auto;
  font-size: 13px;

  // the form is centred both ways, always: the `margin` with `auto` centres it when there is free space,
  // and falls back to the top left when the wrapped form is bigger than the widget (so the start of it
  // stays reachable — `justify-content: center` would clip it)
  .fields {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 4px 10px;
    margin: auto;
  }

  .group {
    display: inline-flex;
    align-items: flex-start;
    gap: 4px;
  }

  // the rule between the position and the rotation: the group names are not written out, this stands in
  // their place (the full name is in the title and the aria-label of the field)
  .group + .group {
    padding-left: 10px;
    border-left: 1px solid $border-dark;
  }

  .field {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    cursor: text;
  }

  .caption {
    color: $text-muted;
    font-size: 10px;
    line-height: 1;
  }

  // the caption needs the room the input has: a narrow widget wraps the groups, it never squeezes the
  // number out of the field. 64px leaves ~54px for the number, and the widest value the form writes
  // ("-1716.36", two decimals) is ~48px, so it is not clipped
  input {
    box-sizing: border-box;
    width: 64px;
    padding: 3px 4px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    font-size: 12px;
    font-weight: bold;
    line-height: 16px;
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
}

// The rule between the position and the rotation only makes sense while the two groups are in one line.
// Six 64px fields, the gaps and the rule are 421px, so below that the groups wrap and the rule would sit
// at the start of the second line, looking like a stray border: it is dropped with its padding.
@container (max-width: 420px) {
  .CameraControlsWidget .group + .group {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
