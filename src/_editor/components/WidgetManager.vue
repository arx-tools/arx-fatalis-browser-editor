<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { LockKeyhole, LockKeyholeOpen, Plus } from 'lucide-vue-next'
import { useEditorShell } from '../modules/shell/editorShellContext.ts'
import WidgetPicker from './WidgetPicker.vue'

const shell = useEditorShell()
const root = ref<HTMLElement>()

/**
 * Tells whether the widget picker is open.
 */
const isPickerOpen = computed(() => {
  return shell.value?.pickerOpen.value === true
})

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

/**
 * Opens or closes the widget picker.
 */
function togglePicker(): void {
  shell.value?.setPickerOpen(!isPickerOpen.value)
}

/**
 * Closes the picker.
 */
function closePicker(): void {
  shell.value?.setPickerOpen(false)
}

/**
 * Closes the picker when the pointer goes down outside of it.
 *
 * @param event The pointer event of the document.
 */
function handlePointerDown(event: PointerEvent): void {
  if (!isPickerOpen.value) {
    return
  }

  if (event.target instanceof Node && root.value?.contains(event.target) === true) {
    return
  }

  closePicker()
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown, { capture: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
})
</script>

<template>
  <div ref="root" class="WidgetManager">
    <span class="label">Widgets</span>
    <button
      class="lock"
      type="button"
      :aria-pressed="isEditing"
      v-tooltip="isEditing ? 'Lock the layout' : 'Unlock the layout'"
      :aria-label="isEditing ? 'Lock the layout' : 'Unlock the layout'"
      @click="toggleEditing"
    >
      <LockKeyholeOpen v-if="isEditing" :size="14" />
      <LockKeyhole v-else :size="14" />
    </button>
    <button class="plus" type="button" v-tooltip="'Add a widget'" aria-label="Add a widget" @click="togglePicker">
      <Plus :size="14" />
    </button>

    <WidgetPicker v-if="isPickerOpen" @close="closePicker" />
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The widget manager: the label of the group and the buttons that act on the widgets of the dock.
// The lock carries the mode: green when the layout is locked, orange (and a lighter plate) when the
// layout editor is open. The popup of the `+` is positioned against this element.
.WidgetManager {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    margin-right: 2px;
    opacity: 0.65;
  }

  .lock,
  .plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: transparent;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }
  }

  .lock {
    color: $ok;

    &[aria-pressed='true'] {
      color: $accent;
      background: $surface-raised;
      border-color: $border-strong;
    }
  }
}
</style>
