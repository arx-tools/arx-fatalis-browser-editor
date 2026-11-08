<script setup lang="ts">
import { Redo2, Undo2, UndoDot } from 'lucide-vue-next'
import { computed } from 'vue'
import { history } from '../../../modules/history/history.ts'
import { redoLastStep, resetHistorySteps, undoLastStep } from '../../../modules/level/edit/editing.ts'
import { isMacKeyboard } from '../../../modules/keyboard/keyboard.ts'

/**
 * The two steps of the history of the level, next to each other.
 *
 * @remarks
 * The keys of the browser do the same (`Ctrl+Z` and `Ctrl+Y`, the same two steps the help lists), and this widget is the
 * two **buttons** of those keys, for a click (2026-11-06, the owner's request): the work of the level is taken back and
 * put again from here. A button is disabled while the step it would take is not there (the beginning or the end of the
 * history), so the widget shows what can be done, and the tooltip says which key does the same.
 */
const canUndo = computed(() => {
  return history.canUndo.value
})

const canRedo = computed(() => {
  return history.canRedo.value
})

/**
 * The name of the primary modifier on this machine, for the tooltips.
 *
 * @remarks
 * `⌘` on an Apple keyboard, `Ctrl` everywhere else: the same name the help of the keys writes.
 */
let primary = 'Ctrl'

if (isMacKeyboard()) {
  primary = '⌘'
}

/**
 * The label and the tooltip of the undo button: the name of the step and the keys of it.
 */
const undoLabel = `Undo (${primary}+Z)`

/**
 * The label and the tooltip of the redo button.
 */
const redoLabel = `Redo (${primary}+Y)`

/**
 * The tooltip of the reset button.
 *
 * @remarks
 * The reset takes every step back and keeps them: the level is the one of its files again, and the author can walk the
 * steps again with the redo. That is why it is not called a discard.
 */
const resetTooltip = 'Take every step back'
</script>

<template>
  <div class="UndoRedoWidget">
    <button
      class="step reset"
      type="button"
      :disabled="!canUndo"
      :aria-label="resetTooltip"
      v-tooltip="resetTooltip"
      @click="resetHistorySteps()"
    >
      <UndoDot :size="14" />
    </button>
    <button
      class="step"
      type="button"
      :disabled="!canUndo"
      :aria-label="undoLabel"
      v-tooltip="undoLabel"
      @click="undoLastStep()"
    >
      <Undo2 :size="14" />
      <span class="label">Undo ({{ primary }}+Z)</span>
    </button>
    <button
      class="step"
      type="button"
      :disabled="!canRedo"
      :aria-label="redoLabel"
      v-tooltip="redoLabel"
      @click="redoLastStep()"
    >
      <Redo2 :size="14" />
      <span class="label">Redo ({{ primary }}+Y)</span>
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// the two steps of the history: the pair sits in the middle of the widget, the icon on the left of the name in each
// button, and a button that has nothing to take back (or to put again) is dimmed. `justify-content: center` keeps the
// two columns together — without it the `auto` columns of a grid stretch, and the pair falls apart to the two sides
.UndoRedoWidget {
  display: grid;
  grid-auto-flow: column;
  place-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  padding: 8px;

  .step {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 8px;
    color: $text-icon;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: $text-strong;
      background: $surface-widget;
      border-color: $border-strong;
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .label {
      white-space: nowrap;
    }
  }
}
</style>
