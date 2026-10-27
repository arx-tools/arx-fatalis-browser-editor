<script setup lang="ts">
// a placeholder until the renderer moves out of the archived app (`src/_old/main.ts`): the widget has
// to prove that the dock cell sizes a canvas-like surface, the scene itself comes in a later round
</script>

<template>
  <div class="View3DWidget">
    <p>3D view</p>
    <small>(the renderer comes in a later round)</small>
  </div>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

.View3DWidget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: $surface-widget;
  color: $text-muted;

  p {
    margin: 0;
    font-size: 13px;
  }

  small {
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.7;
  }
}
</style>
