<script setup lang="ts">
import { computed } from 'vue'
import { LockKeyhole, LockKeyholeOpen, Plus } from 'lucide-vue-next'
import { useEditorShell } from '../modules/shell/editorShellContext.ts'

const shell = useEditorShell()

/**
 * Tells whether the layout edit mode is on.
 */
const isEditing = computed(() => {
  return shell.value?.isEditing.value === true
})

/**
 * Turns the layout edit mode on or off.
 */
function toggleEditing(): void {
  const current = shell.value

  if (current !== undefined) {
    current.setEditing(!current.isEditing.value)
  }
}
</script>

<template>
  <div class="WidgetManager">
    <span class="label">Widgets</span>
    <button
      class="lock"
      type="button"
      :aria-pressed="isEditing"
      :title="isEditing ? 'Lock the layout' : 'Unlock the layout'"
      :aria-label="isEditing ? 'Lock the layout' : 'Unlock the layout'"
      @click="toggleEditing"
    >
      <LockKeyholeOpen v-if="isEditing" :size="14" />
      <LockKeyhole v-else :size="14" />
    </button>
    <button class="icon-button" type="button" disabled title="Add a widget">
      <Plus :size="14" />
    </button>
  </div>
</template>

<style scoped lang="scss">
// The widget manager: the label of the group and the buttons that act on the widgets of the dock.
// The lock carries the mode: green when the layout is locked, orange (and a lighter plate) when the
// layout editor is open.
.WidgetManager {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    margin-right: 2px;
    opacity: 0.65;
  }

  .lock {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: #6aa84f;
    background: transparent;
    border: 1px solid #3a3f47;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: #2f343b;
    }

    &[aria-pressed='true'] {
      color: #e69138;
      background: #4a5058;
      border-color: #5b626b;
    }
  }
}
</style>
