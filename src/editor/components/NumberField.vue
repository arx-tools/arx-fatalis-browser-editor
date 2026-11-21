<script setup lang="ts">
import { useTemplateRef } from 'vue'

/**
 * A number typed into a text field: no spinner, the whole value selected when the field takes the focus.
 *
 * @remarks
 * The number input of the browsers draws the two arrows of the spinner, and firefox draws them wide enough to make a
 * narrow form ugly (2026-11-21, the owner). The editor writes its numbers in a text field with the numeric keyboard on a
 * touch screen: the field is the one of the camera form, the snapping threshold and the light editor, and the arrows of
 * the keyboard step it where the widget asks for a step.
 *
 * The field is controlled: the text is the `modelValue`, and the widget parses it (the camera form keeps the half typed
 * text, the snapping settings clamp the value, the export reads the text). The `step` flag turns the arrow keys into a
 * `step` event; a field without it leaves the arrows to the caret, the way a text field does.
 */
const props = withDefaults(
  defineProps<{
    /**
     * The text of the field.
     */
    readonly modelValue: string
    /**
     * The name of the field, for the screen reader.
     */
    readonly label: string
    /**
     * The keyboard the field asks for: `decimal` for a number with a fraction, `numeric` for a whole one.
     */
    readonly inputmode?: 'numeric' | 'decimal'
    /**
     * Whether the text in the field is not a number the widget can use: the field shows the edge of the mistake.
     */
    readonly invalid?: boolean
    /**
     * Whether the field is read only.
     */
    readonly disabled?: boolean
    /**
     * Whether the arrow keys step the value (the widget handles the `step` event), or leave the caret alone.
     */
    readonly step?: boolean
  }>(),
  {
    inputmode: 'decimal',
    invalid: false,
    disabled: false,
    step: false,
  },
)

/**
 * The text of the field, or the arrow the widget asked for.
 */
const emit = defineEmits<{
  'update:modelValue': [value: string]
  step: [direction: 1 | -1]
}>()

/**
 * The input, so the focus can select its whole text.
 */
const field = useTemplateRef<HTMLInputElement>('field')

/**
 * Selects the whole text of the field when it takes the focus.
 *
 * @remarks
 * A number is typed over: a click that leaves the caret in the middle of the digits would make the next number a mix of
 * the two, so the focus takes the whole value (the camera form had this rule first, 2026-10-29).
 */
function selectAll(): void {
  field.value?.select()
}

/**
 * Writes the typed text into the model.
 *
 * @param event The input of the field.
 */
function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

/**
 * Steps the value with the arrow keys, when the widget asked for a step.
 *
 * @param direction `1` steps up, `-1` steps down.
 * @param event The keydown of the arrow.
 */
function onStep(direction: 1 | -1, event: KeyboardEvent): void {
  if (!props.step) {
    return
  }

  event.preventDefault()
  emit('step', direction)
}
</script>

<template>
  <input
    ref="field"
    class="NumberField"
    :class="{ invalid }"
    :value="modelValue"
    type="text"
    :inputmode="inputmode"
    :disabled="disabled"
    :aria-label="label"
    autocomplete="off"
    spellcheck="false"
    @input="onInput"
    @focus="selectAll"
    @keydown.up="onStep(1, $event)"
    @keydown.down="onStep(-1, $event)"
  />
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the box of a number: the same edge as the camera form and the settings rows. The width is the widget's: the camera
// cells are 64px, the threshold of the snapping settings is narrower, and the export dialog takes the whole line.
.NumberField {
  box-sizing: border-box;
  padding: 3px 4px;
  border: 1px solid $border-dark;
  border-radius: 4px;
  background: $surface-panel;
  color: $text;
  font: inherit;
  font-size: 12px;
  font-weight: bold;
  line-height: 16px;

  &.invalid {
    border-color: $danger;
    outline: 1px solid $danger;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
