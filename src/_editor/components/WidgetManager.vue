<script setup lang="ts">
import { LockKeyhole, Plus } from 'lucide-vue-next'
</script>

<template>
  <div class="WidgetManager">
    <span class="label">Widgets</span>
    <button class="icon-button" type="button" disabled title="Unlock the layout">
      <LockKeyhole :size="14" />
    </button>
    <button class="icon-button" type="button" disabled title="Add a widget">
      <Plus :size="14" />
    </button>
  </div>
</template>

<style scoped lang="scss">
// The widget manager: the label of the group and the buttons that act on the widgets of the dock.
// The root class is the component name, so the element is easy to find in the devtools; the nested
// names stay short, and how much room the manager takes is the header's business, not its own.
.WidgetManager {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    margin-right: 2px;
    opacity: 0.65;
  }
}
</style>
