<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'

const props = defineProps<{
  /**
   * The name of the widget, shown on the plate.
   */
  label: string
}>()

const emit = defineEmits<{
  /**
   * The trash of the plate was clicked: the widget has to be removed from the dock.
   */
  remove: []
}>()
</script>

<template>
  <div class="WidgetOverlay">
    <span class="name">{{ props.label }}</span>
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
  background: rgb(72 77 85 / 74%);
  border: 2px dashed transparent;
  cursor: move;
  touch-action: none;

  &:hover {
    background: rgb(86 92 101 / 74%);
    border-color: rgb(230 145 56 / 80%);
  }

  .name {
    padding: 4px 10px;
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    background: rgb(20 22 26 / 65%);
    border: 1px solid rgb(255 255 255 / 12%);
    border-radius: 3px;
    text-shadow: 0 1px 3px black;
    pointer-events: none;
  }

  .trash {
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    color: #f6d7d2;
    background: rgb(140 40 30 / 88%);
    border: 1px solid rgb(200 80 60 / 70%);
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      color: #fff;
      background: #b8402c;
    }
  }
}
</style>
