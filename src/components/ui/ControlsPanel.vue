<script setup lang="ts">
import {
  anchorsVisible,
  ambientFloor,
  cameraLightVisible,
  isComputingLighting,
  lightingCalculatorMode,
  lightsVisible,
  portalsVisible,
  shadows,
  wireframeVisible,
} from '../../ui/ui'
import LightingSettings from './LightingSettings.vue'
import ToggleSwitch from './ToggleSwitch.vue'
</script>

<template>
  <div class="controls">
    <div class="toggles">
      <ToggleSwitch v-model="cameraLightVisible" label="Flashlight" hotkey="F" />
      <ToggleSwitch v-model="wireframeVisible" label="Wireframe" hotkey="X" />
      <ToggleSwitch v-model="anchorsVisible" label="Anchors" hotkey="J" />
      <ToggleSwitch v-model="portalsVisible" label="Portals" hotkey="K" />
      <ToggleSwitch v-model="lightsVisible" label="Lights" hotkey="L" />
    </div>

    <p class="hint">
      Double click: select the connected polygons of the same texture.<br />
      <code>[C]</code> to clear selection<br />
      <code>[Del]</code> to delete selected polygons<br />
      Hold <code>[Shift]</code> while selecting to add to existing selection<br />
      Hold <code>[Ctrl]</code> while selecting to remove from existing selection
    </p>

    <div class="settings">
      <h3>Settings</h3>
      <LightingSettings
        v-model:mode="lightingCalculatorMode"
        v-model:ambient-floor="ambientFloor"
        v-model:shadows="shadows"
        :computing="isComputingLighting"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 10px;

  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .settings h3 {
    margin: 0 0 8px;
    font-size: 14px;
  }
}
</style>
