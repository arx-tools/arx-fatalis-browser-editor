<script setup lang="ts">
import { computed, ref } from 'vue'
import { cameraStore } from '../cameraStore.ts'
import FieldLabel from '../../FieldLabel.vue'
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
    <FieldLabel class="field" label="Jump to" for="jump-target">
      <div class="row">
        <select id="jump-target" v-model="selectedId" :disabled="readOnly">
          <option v-for="target in targets" :key="target.id" :value="target.id">{{ target.label }}</option>
        </select>
        <button type="button" :disabled="readOnly" @click="onGo">Go</button>
      </div>
    </FieldLabel>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// A jump is one thin row: the caption above, under it the select of the targets and the button that goes
// there. The caption is above and not beside the select, like the fields of the camera form: a word in
// the row would take the width the target name needs, and the widget has to fit in a strip as well (the
// dock reads the minimum height from `style.scss`).
.JumpToLocationWidget {
  display: flex;
  height: 100%;
  padding: 4px;
  overflow: auto;
  font-size: 13px;

  // centred both ways, always: the `margin` with `auto` centres the caption and the row when there is free
  // space, and falls back to the top left when the widget is too small for them (the caption and the two
  // pixels under it come from the `FieldLabel` component)
  .field {
    margin: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  select {
    min-width: 120px;
    padding: 3px 5px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    line-height: 16px;
  }

  button {
    padding: 3px 10px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    font-weight: bold;
    line-height: 16px;
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
