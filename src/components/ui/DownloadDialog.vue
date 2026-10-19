<script setup lang="ts">
import { exportLevel } from '../../download-handler'
import { closeDownloadDialog, downloadSettings, downloadSummary } from '../../ui/download-state'
import LightingSettings from './LightingSettings.vue'

function onExport(): void {
  closeDownloadDialog()
  exportLevel()
}
</script>

<template>
  <div class="download-dialog">
    <h2>Export level</h2>

    <p class="summary">{{ downloadSummary }}</p>

    <LightingSettings
      v-model:mode="downloadSettings.mode"
      v-model:ambient-floor="downloadSettings.ambientFloor"
      v-model:shadows="downloadSettings.shadows"
    />

    <div class="buttons">
      <button type="button" @click="closeDownloadDialog()">Cancel</button>
      <button type="button" class="primary" @click="onExport()">Export</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.download-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 520px;

  h2 {
    margin: 0;
    font-size: 16px;
  }

  .summary {
    margin: 0 0 20px;
    font-size: 12px;
    color: #b9b2aa;
  }

  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;

    button {
      padding: 4px 12px;
    }
  }
}
</style>
