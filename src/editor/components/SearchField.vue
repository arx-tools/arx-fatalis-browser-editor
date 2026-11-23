<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { useTemplateRef } from 'vue'

/**
 * The search field of a list: the glass, the field and the button that empties it.
 *
 * @remarks
 * The light, the room and the texture lists had the same field three times, down to the focus that selects the whole
 * word (the author types over the filter, 2026-11-12) and the clear button that leaves the focus on the field. The
 * field owns that behavior; the widget owns the query (`v-model`), the placeholder and the name the screen reader
 * hears.
 *
 * The field is a flex item without a size of its own: the row it sits in sets the width (the light list next to the
 * shape filter, the room list across the inspector).
 */
defineProps<{
  /**
   * The text of the field.
   */
  readonly modelValue: string
  /**
   * The hint of the empty field.
   */
  readonly placeholder: string
  /**
   * The name of the field, for the screen reader.
   */
  readonly label: string
}>()

/**
 * The text of the field, as the next value of the widget's query.
 */
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/**
 * The field, so the clear button can put the focus back on it.
 */
const field = useTemplateRef<HTMLInputElement>('field')

/**
 * Selects the whole text of the field when it takes the focus.
 *
 * @remarks
 * A filter is typed over: a click that leaves the caret in the middle of the word would make the next word a delete of
 * half of it, so the focus takes the whole word, ready to be typed over (2026-11-12, the owner).
 */
function selectAll(): void {
  field.value?.select()
}

/**
 * Writes the typed text into the query.
 *
 * @param event The input of the field.
 */
function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

/**
 * Empties the field, and leaves the focus on it.
 *
 * @remarks
 * The clear button is the end of the field: the pointer is already there, and the next word is typed right away.
 */
function clear(): void {
  emit('update:modelValue', '')
  field.value?.focus()
  selectAll()
}
</script>

<template>
  <label class="SearchField">
    <Search :size="12" class="icon" />
    <input
      ref="field"
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      :aria-label="label"
      autocomplete="off"
      spellcheck="false"
      @input="onInput"
      @focus="selectAll"
    />
    <button v-if="modelValue !== ''" class="clear" type="button" aria-label="Empty the search" @click.prevent="clear">
      <X :size="12" />
    </button>
  </label>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the field of a search: the glass on the left, the clear button on the right, the two icons inside the border of the
// input. The browsers draw their own clear button for a search field, and it would sit next to the one of the widget:
// the one of the widget is the button of every browser.
.SearchField {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 110px;

  .icon {
    position: absolute;
    left: 6px;
    color: $text-subtle;
    pointer-events: none;
  }

  input::-webkit-search-cancel-button,
  input::-webkit-search-decoration {
    appearance: none;
  }

  // the clear button of the field: the quiet gray of an icon, the bright text under the pointer
  .clear {
    position: absolute;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: $text-subtle;
    background: none;
    border: 0;
    cursor: pointer;

    &:hover {
      color: $text;
    }
  }

  input {
    box-sizing: border-box;
    width: 100%;
    // the room of the two icons of the field: the glass on the left, the clear button on the right
    padding: 3px 22px 3px 22px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }
  }
}
</style>
