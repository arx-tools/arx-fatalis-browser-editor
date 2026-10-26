<script setup lang="ts">
import {
  ambientFloor,
  anchorsVisible,
  anchorDiffVisible,
  bothAnchorGraphsVisible,
  lightingCalculatorMode,
  lightsVisible,
  meshVisible,
  portalsVisible,
  rejectedLinksVisible,
  shadowsRendering,
  debugPanelVisible,
  wireframeVisible,
} from '../../_editor/state/state'
import { isComputingAnchors, isComputingLighting, showGeneratedAnchors } from '../../ui/ui'
import LightingSettings from './LightingSettings.vue'
import ToggleSwitch from './ToggleSwitch.vue'
</script>

<template>
  <div class="controls">
    <div class="toggles">
      <ToggleSwitch v-model="meshVisible" label="Mesh" hotkey="M" />
      <ToggleSwitch v-model="wireframeVisible" label="Wireframe" hotkey="X" />
      <ToggleSwitch v-model="anchorsVisible" label="Anchors" hotkey="J" :status="true" :busy="isComputingAnchors" />
      <ToggleSwitch v-model="portalsVisible" label="Portals" hotkey="K" />
      <ToggleSwitch v-model="lightsVisible" label="Lights" hotkey="L" />
    </div>

    <div class="settings">
      <h3>Settings</h3>
      <LightingSettings
        v-model:mode="lightingCalculatorMode"
        v-model:ambient-floor="ambientFloor"
        v-model:shadows="shadowsRendering"
        :computing="isComputingLighting"
      />

      <label class="generated-anchors">
        <span>Use auto-generated anchors</span>
        <input v-model="showGeneratedAnchors" type="checkbox" />
      </label>
    </div>

    <div class="settings">
      <h3>Debug</h3>
      <label class="generated-anchors">
        <span>Both anchor graphs</span>
        <input v-model="bothAnchorGraphsVisible" type="checkbox" />
      </label>
      <label class="generated-anchors">
        <span>Anchor diff</span>
        <input v-model="anchorDiffVisible" type="checkbox" />
      </label>
      <label class="generated-anchors">
        <span>Repaired links</span>
        <input v-model="rejectedLinksVisible" type="checkbox" />
      </label>
      <label class="generated-anchors">
        <span>Show debug panel</span>
        <input v-model="debugPanelVisible" type="checkbox" />
        <span class="hint">(hotkey F2)</span>
      </label>
    </div>
  </div>
</template>

<style scoped lang="scss">
.generated-anchors {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.hint {
  color: #8b8080;
  font-weight: normal;
}

.generated-anchors input {
  margin: 0;
  cursor: pointer;
}
</style>

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

  .settings h3 {
    margin: 0 0 8px;
    font-size: 1em;
    font-weight: bold;
  }
}
</style>
