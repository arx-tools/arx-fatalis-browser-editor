<script setup lang="ts">
import WidgetManager from './WidgetManager.vue'

// the version, the commit and the build date of this build (see `vite.config.ts`)
const buildInfo = BUILD_INFO
</script>

<template>
  <header class="EditorHeader">
    <div class="brand">
      <span class="title">Arx Fatalis Browser Editor</span>
      <span class="version">{{ buildInfo }}</span>
    </div>

    <WidgetManager />
  </header>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The header is scoped: the root class is the component name, the nested names stay short, and the
// nesting only follows the elements of this component.
.EditorHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid $border-dark;
  background: $surface-float;

  // the brand takes the free space, so the widget manager ends up on the right side
  .brand {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 8px;
    min-width: 0;

    .title {
      color: $text;
      white-space: nowrap;
    }

    // the version, the commit and the build date: muted, so the title stays the loud one
    .version {
      color: $text-subtle;
      font-size: 11px;
      white-space: nowrap;
    }
  }
}
</style>
