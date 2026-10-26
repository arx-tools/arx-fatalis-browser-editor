<script setup lang="ts">
import { computed } from 'vue'
import type { LightingCalculatorMode } from '../../_generator/types'
import { minimumLightLevels } from '../../ui/ui'

const props = defineProps<{
  mode: LightingCalculatorMode
  ambientFloor: number
  shadows: boolean
  /**
   * Shows the "computing lighting..." spinner (the main panel does, the export dialog does not).
   */
  computing?: boolean
}>()

const emit = defineEmits<{
  'update:mode': [value: LightingCalculatorMode]
  'update:ambientFloor': [value: number]
  'update:shadows': [value: boolean]
}>()

const minimumLightIndex = computed(() => {
  const index = minimumLightLevels.indexOf(props.ambientFloor)

  if (index === -1) {
    return 0
  }

  return index
})

function onModeChange(event: Event): void {
  emit('update:mode', (event.target as HTMLSelectElement).value as LightingCalculatorMode)
}

function onMinimumLightInput(event: Event): void {
  const index = Number((event.target as HTMLInputElement).value)

  emit('update:ambientFloor', minimumLightLevels[index] ?? 0)
}

function onShadowsChange(event: Event): void {
  emit('update:shadows', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <div class="lighting-settings">
    <div class="row">
      <label class="lighting-mode">
        Lighting
        <select :value="mode" @change="onModeChange">
          <option value="Arx">Arx — the game's palette and lights</option>
          <option value="Realistic">Realistic — computed palette with shadows</option>
          <option value="TextureRainbow">TextureRainbow — a colour per texture (late edits are blue)</option>
          <option value="MaxBrightness">MaxBrightness — unlit white</option>
          <option value="CompleteDarkness">CompleteDarkness — unlit black</option>
        </select>
      </label>

      <span v-if="computing" class="lighting-spinner" title="Computing lighting..."></span>
    </div>

    <div v-if="mode === 'Realistic'" class="row realistic">
      <label class="minimum-light">
        Minimum light level
        <input
          type="range"
          min="0"
          :max="minimumLightLevels.length - 1"
          step="1"
          :value="minimumLightIndex"
          @input="onMinimumLightInput"
        />
        <output>{{ ambientFloor }}</output>
      </label>

      <label class="shadows">
        <input type="checkbox" :checked="shadows" @change="onShadowsChange" />
        Include shadows
      </label>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lighting-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }

  .lighting-mode,
  .minimum-light,
  .shadows {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }

  select {
    font: inherit;
  }

  input[type='range'] {
    width: 140px;
    vertical-align: middle;
  }

  output {
    min-width: 2.5em;
    font-family: monospace;
    text-align: right;
  }

  .lighting-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid rgb(255 255 255 / 25%);
    border-top-color: #ffd23f;
    border-radius: 50%;
    animation: lighting-spinner-spin 0.7s linear infinite;
  }
}

@keyframes lighting-spinner-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
