<script setup lang="ts">
import ControlsPanel from './ControlsPanel.vue'
</script>

<template>
  <Teleport to="#controls-slot">
    <ControlsPanel />
  </Teleport>
</template>
