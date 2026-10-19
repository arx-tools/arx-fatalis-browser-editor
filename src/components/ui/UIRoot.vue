<script setup lang="ts">
import ControlsPanel from './ControlsPanel.vue'
import DownloadDialog from './DownloadDialog.vue'
</script>

<template>
  <Teleport to="#controls-slot">
    <ControlsPanel />
  </Teleport>

  <Teleport to="#dialog-slot">
    <DownloadDialog />
  </Teleport>
</template>
