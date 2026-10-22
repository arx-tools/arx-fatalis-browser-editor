<script setup lang="ts">
import { computed } from 'vue'
import {
  alignCameraTo,
  cameraDialogVisible,
  cameraFieldNames,
  cameraFields,
  commitCameraFields,
  parseCameraField,
  type CameraAlignMode,
  type CameraFieldName,
} from '../../ui/camera'
import DraggablePanel from './DraggablePanel.vue'

const invalid = computed(() => {
  const result = {} as Record<CameraFieldName, boolean>
  for (const name of cameraFieldNames) {
    result[name] = parseCameraField(cameraFields[name]) === undefined
  }
  return result
})

function onInput(name: CameraFieldName, event: Event): void {
  cameraFields[name] = (event.target as HTMLInputElement).value
  commitCameraFields()
}

/** focus selects the whole value, so a new number can be typed right away */
function onFocus(event: FocusEvent): void {
  ;(event.target as HTMLInputElement).select()
}

function close(): void {
  cameraDialogVisible.value = false
}

const tabindexOf = (name: CameraFieldName): number => 100 + cameraFieldNames.indexOf(name)

function onAlign(mode: CameraAlignMode): void {
  alignCameraTo.value?.(mode)
}
</script>

<template>
  <DraggablePanel
    v-if="cameraDialogVisible && alignCameraTo !== undefined"
    title="Camera"
    :width="400"
    closable
    @close="close"
  >
    <div class="camera-dialog__row">
      <span class="camera-dialog__label">position</span>
      <input
        v-for="name in cameraFieldNames.slice(0, 3)"
        :key="name"
        :value="cameraFields[name]"
        :class="{ invalid: invalid[name] }"
        :tabindex="tabindexOf(name)"
        type="number"
        step="10"
        :aria-label="`position ${name}`"
        @input="onInput(name, $event)"
        @focus="onFocus"
      />
    </div>

    <div class="camera-dialog__row">
      <span class="camera-dialog__label">rotation</span>
      <input
        v-for="name in cameraFieldNames.slice(3)"
        :key="name"
        :value="cameraFields[name]"
        :class="{ invalid: invalid[name] }"
        :tabindex="tabindexOf(name)"
        :disabled="name === 'roll'"
        type="number"
        step="10"
        :aria-label="`rotation ${name}`"
        @input="onInput(name, $event)"
        @focus="onFocus"
      />
    </div>

    <div class="camera-dialog__row camera-dialog__align">
      <span class="camera-dialog__label">Align to:</span>
      <button type="button" :tabindex="106" @click="onAlign('top')">top</button>
      <button type="button" :tabindex="107" @click="onAlign('front')">front</button>
      <button type="button" :tabindex="108" @click="onAlign('left')">left</button>
    </div>
  </DraggablePanel>
</template>

<style scoped lang="scss">
.camera-dialog__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.camera-dialog__label {
  width: 64px;
  color: #b9aeae;
}

input {
  width: 92px;
  padding: 3px 5px;
  border: 1px solid #1a1717;
  border-radius: 4px;
  background: #595151;
  color: inherit;
  font: inherit;
  font-weight: bold;
}

input.invalid {
  border-color: #e04b4b;
  outline: 1px solid #e04b4b;
}

input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.camera-dialog__align {
  margin-top: 15px;
}

.camera-dialog__align button {
  padding: 3px 10px;
  border: 1px solid #1a1717;
  border-radius: 4px;
  background: #595151;
  color: inherit;
  font: inherit;
  font-weight: bold;
  cursor: pointer;
}

.camera-dialog__align button:hover {
  background: #6b6262;
}
</style>
