<script setup lang="ts">
import { Lock, LockOpen, Trash2 } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { formatSize } from '../modules/format.ts'

const props = defineProps<{
  /**
   * The name of the widget, shown on the plate.
   */
  label: string
  /**
   * Whether the widget is locked to its size when the plate is drawn.
   */
  locked: boolean
}>()

const emit = defineEmits<{
  /**
   * The trash of the plate was clicked: the widget has to be removed from the dock.
   */
  remove: []
  /**
   * The lock of the plate was clicked: the widget has to keep its size, or stop keeping it.
   */
  toggleLock: []
}>()

// the button shows the state it switched to: the plate is not redrawn when the dock is refitted
const isLocked = ref(props.locked)

// the plate covers the widget, so its box is the box of the widget: the size a lock keeps is what the user reads here
const plate = useTemplateRef<HTMLElement>('plate')
const size = ref('')

let observer: ResizeObserver | undefined

/**
 * Reads the size of the widget the plate covers into the badge.
 *
 * @remarks
 * The box is measured on every frame a resize happens — a border of the dock is dragged, the window changes, a lock
 * writes a new size — because the number is what the user writes into a preset of the layout, and it has to be the one
 * on the screen at that moment, not the one the lock asked for before the layout squeezed it.
 */
function measure(): void {
  const box = plate.value?.getBoundingClientRect()

  if (box === undefined) {
    return
  }

  size.value = formatSize(box.width, box.height)
}

onMounted(() => {
  measure()
  observer = new ResizeObserver(() => {
    measure()
  })

  if (plate.value !== null) {
    observer.observe(plate.value)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})

/**
 * Toggles the lock of the widget.
 */
function toggleLock(): void {
  isLocked.value = !isLocked.value
  emit('toggleLock')
}
</script>

<template>
  <div ref="plate" class="WidgetOverlay">
    <span v-if="isLocked" class="size">{{ size }}</span>
    <span class="name">{{ props.label }}</span>
    <button
      class="lock"
      :class="{ 'is-on': isLocked }"
      type="button"
      v-tooltip="isLocked ? 'Let the widget follow the layout again' : 'Keep the size of the widget'"
      :aria-label="isLocked ? 'Unlock the widget' : 'Lock the widget'"
      :aria-pressed="isLocked"
      @pointerdown.stop
      @click="toggleLock()"
    >
      <component :is="isLocked ? Lock : LockOpen" :size="14" />
    </button>
    <button
      class="trash"
      type="button"
      v-tooltip="`Remove the ${props.label} widget`"
      :aria-label="`Remove the ${props.label} widget`"
      @pointerdown.stop
      @click="emit('remove')"
    >
      <Trash2 :size="14" />
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The overlay of a widget in the edit mode: a grey plate, the name on a chip and the trash in the
// top right corner. It covers the whole widget, so the entire surface is the drag handle.
.WidgetOverlay {
  position: absolute;
  z-index: 10;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: rgba($surface-overlay, 0.74);
  border: 2px dashed transparent;
  cursor: move;
  touch-action: none;

  &:hover {
    background: rgba($surface-spotlit, 0.74);
    border-color: rgba($accent, 0.8);
  }

  // the size of a locked widget, in the top left corner: the user reads it off, drags until it looks right, and writes
  // the number into a preset. It follows the plate, so a drag of a border updates it on the same frame
  .size {
    position: absolute;
    top: 6px;
    left: 6px;
    padding: 2px 6px;
    color: $text-strong;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
    white-space: nowrap;
    background: rgba($surface-widget, 0.88);
    border: 1px solid rgba($text-strong, 0.24);
    border-radius: 4px;
    pointer-events: none;
  }

  .name {
    padding: 4px 10px;
    color: $text-strong;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgba($surface-widget, 0.65);
    border: 1px solid rgba($text-strong, 0.12);
    border-radius: 3px;
    text-shadow: 0 1px 3px $ink;
    pointer-events: none;
  }

  // the lock sits left of the trash, the same size and the same frame: the two are the buttons of the plate
  .lock,
  .trash {
    position: absolute;
    top: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 4px;
    cursor: pointer;
  }

  .lock {
    right: 38px;
    color: $text;
    background: rgba($surface-widget, 0.88);
    border: 1px solid rgba($text-strong, 0.24);

    &:hover {
      color: $text-strong;
      border-color: rgba($accent, 0.8);
    }

    &.is-on {
      color: $text-strong;
      background: rgba($accent, 0.32);
      border-color: rgba($accent, 0.8);
    }
  }

  .trash {
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: $text-on-danger;
    background: rgba($danger-deep, 0.88);
    border: 1px solid rgba($danger-bright, 0.7);
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      color: $text-strong;
      background: $danger;
    }
  }
}
</style>
