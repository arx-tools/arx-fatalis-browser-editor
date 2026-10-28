<script setup lang="ts">
import { computed, ref } from 'vue'
import { cameraStore } from '../cameraStore.ts'
import { jumpTargets, jumpTo } from './locations.ts'

/**
 * The targets of the select.
 *
 * @remarks
 * It is a computed, so a future source of points (the entities of the level, the points the user drops)
 * only has to make the list reactive; the widget does not change.
 */
const targets = computed(() => {
  return jumpTargets()
})

/**
 * The chosen target: the first one of the list until the user picks another.
 */
const selectedId = ref(targets.value[0]?.id ?? '')

/**
 * Tells whether there is a camera to move: without a 3D view the select and the button are read only.
 */
const readOnly = computed(() => {
  return !cameraStore.hasView.value
})

/**
 * Moves the camera to the chosen target.
 */
function onGo(): void {
  jumpTo(targets.value, selectedId.value, cameraStore)
}
</script>

<template>
  <div class="JumpToLocationWidget">
    <div class="row">
      <label class="label" for="jump-target">Jump to</label>
      <select id="jump-target" v-model="selectedId" :disabled="readOnly">
        <option v-for="target in targets" :key="target.id" :value="target.id">{{ target.label }}</option>
      </select>
      <button type="button" :disabled="readOnly" @click="onGo">Go</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// A jump is one row: the select of the targets and the button that goes there. The widget has no other
// content, so it can be a thin strip as well (the dock reads the minimum height from `style.scss`).
.JumpToLocationWidget {
  height: 100%;
  padding: 8px;
  overflow: auto;
  font-size: 13px;

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .label {
    color: $text-muted;
    white-space: nowrap;
  }

  select {
    min-width: 120px;
    padding: 3px 5px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
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

  select:disabled,
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
