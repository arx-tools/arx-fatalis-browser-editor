<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Check, ChevronDown, LockKeyhole, LockKeyholeOpen, Settings } from 'lucide-vue-next'
import { useEditorShell } from '../modules/shell/editorShellContext.ts'
import WidgetPicker from './WidgetPicker.vue'

const shell = useEditorShell()
const root = ref<HTMLElement>()
const anchor = ref<HTMLElement>()

/**
 * The left of the popup, in the coordinates of the manager: the gear sits in the middle above the list.
 *
 * @remarks
 * The value is measured, not guessed: the group grows with the label and the buttons, and the popup is
 * clamped to the window, so a narrow one still shows the whole list.
 */
const pickerLeft = ref<number | undefined>(undefined)

/**
 * The presets of the layout dropdown: the factory ones, and the custom slot once there is one.
 */
const presets = computed(() => {
  return shell.value?.presets.value ?? []
})

/**
 * The preset the dropdown shows as selected.
 */
const selectedPreset = computed(() => {
  return shell.value?.selectedPreset.value ?? 'default'
})

/**
 * Tells whether the preset menu is open.
 */
const isPresetOpen = ref(false)

/**
 * The name of the selected preset, which the button of the menu shows.
 */
const selectedLabel = computed(() => {
  return (
    presets.value.find((preset) => {
      return preset.id === selectedPreset.value
    })?.label ?? ''
  )
})

/**
 * Puts the chosen preset on the dock and closes the menu.
 *
 * @param id The identifier of the preset.
 */
function choosePreset(id: string): void {
  shell.value?.applyPreset(id)
  isPresetOpen.value = false
}

/**
 * Opens or closes the preset menu.
 */
function togglePresets(): void {
  isPresetOpen.value = !isPresetOpen.value
}

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
 * Places the popup so its middle is under the middle of the gear.
 *
 * @remarks
 * The popup is only in the document while it is open, so this runs after the render, and reads the width of
 * the popup itself.
 */
function placePicker(): void {
  const manager = root.value
  const button = manager?.querySelector('.plus')

  if (manager === undefined || !(button instanceof HTMLElement)) {
    return
  }

  const gear = button.getBoundingClientRect()
  const frame = manager.getBoundingClientRect()
  const width = anchor.value?.firstElementChild?.getBoundingClientRect().width ?? 0
  const half = width / 2
  const margin = 6
  const halfGear = gear.width / 2
  const middle = gear.left + halfGear
  const lowest = half + margin
  const highest = window.innerWidth - half - margin
  const centre = Math.min(Math.max(middle, lowest), highest)

  pickerLeft.value = centre - frame.left
}

/**
 * Opens or closes the widget picker.
 */
function togglePicker(): void {
  shell.value?.setPickerOpen(!isPickerOpen.value)
}

/**
 * Follows the open state: the popup is placed right after it appears.
 */
watch(isPickerOpen, async (open) => {
  if (!open) {
    pickerLeft.value = undefined

    return
  }

  await nextTick()
  placePicker()
})

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
  if (!isPickerOpen.value && !isPresetOpen.value) {
    return
  }

  if (event.target instanceof Node && root.value?.contains(event.target) === true) {
    return
  }

  closePicker()
  isPresetOpen.value = false
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
    <button
      class="plus"
      :class="{ 'is-open': isPickerOpen }"
      type="button"
      aria-haspopup="menu"
      :aria-expanded="isPickerOpen"
      v-tooltip="'Add a widget'"
      aria-label="Add a widget"
      @click="togglePicker"
    >
      <Settings :size="14" />
    </button>
    <span class="presets">
      <span class="label">Presets</span>
      <button
        class="preset"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="isPresetOpen"
        aria-label="Presets"
        v-tooltip="'Choose a layout preset'"
        @click="togglePresets"
      >
        <span class="name">{{ selectedLabel }}</span>
        <ChevronDown :size="12" />
      </button>
      <div v-if="isPresetOpen" class="preset-menu" role="menu">
        <template v-for="preset in presets" :key="preset.id">
          <!-- the custom slot is the one level of history, so it is set apart from the factory presets -->
          <hr v-if="preset.id === 'custom'" class="divider" />
          <button
            class="preset-row"
            :class="{ 'is-selected': preset.id === selectedPreset }"
            type="button"
            role="menuitem"
            @click="choosePreset(preset.id)"
          >
            <Check v-if="preset.id === selectedPreset" :size="12" />
            <span v-else class="spacer"></span>
            <span class="name">{{ preset.label }}</span>
          </button>
        </template>
      </div>
    </span>

    <div v-if="isPickerOpen" ref="anchor" class="picker-anchor" :style="{ left: `${pickerLeft ?? 0}px` }">
      <WidgetPicker @close="closePicker" />
    </div>
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

  // the preset menu hangs from here, so the wrapper is the positioning context
  .presets {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;

    > .preset {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 22px;
      padding: 0 4px 0 6px;
      color: $text;
      font: inherit;
      font-size: 12px;
      background: $surface-panel;
      border: 1px solid $border;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: $surface-raised;
      }
    }
  }

  // the list of the presets: the factory ones, and the custom slot under a line when it exists
  .preset-menu {
    position: absolute;
    z-index: 50;
    top: calc(100% + 4px);
    right: 0;
    display: flex;
    flex-direction: column;
    min-width: 150px;
    padding: 4px;
    background: $surface-float;
    border: 1px solid $border;
    border-radius: 6px;
    box-shadow: 0 10px 28px rgba($ink, 0.55);
  }

  .preset-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    color: $text;
    font: inherit;
    font-size: 12px;
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }

    &.is-selected {
      color: $text-strong;
    }

    // the check keeps its place on the rows that are not selected
    .spacer {
      width: 12px;
    }
  }

  .divider {
    margin: 4px 2px;
    border: 0;
    border-top: 1px solid $border;
  }

  // the icon buttons of the group: every button that hangs directly on the manager looks like this, so a
  // renamed one keeps its look
  & > button {
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

  // the popup hangs from here: a zero sized box at the middle of the gear (the left comes from the script)
  .picker-anchor {
    position: absolute;
    top: 100%;
    width: 0;
    height: 0;
  }

  // the plus is lit while its popup is open: it says which button the list belongs to
  .plus.is-open {
    color: $text-strong;
    background: $surface-raised;
    border-color: $border-strong;
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
