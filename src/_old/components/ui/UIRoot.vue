<script setup lang="ts">
import CameraDialog from './CameraDialog.vue'
import ControlsPanel from './ControlsPanel.vue'
</script>

<template>
  <Teleport to="#controls-slot">
    <ControlsPanel />
  </Teleport>
  <CameraDialog />
</template>
