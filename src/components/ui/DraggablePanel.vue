<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * A floating panel that can be dragged by its header and resized from its bottom right corner.
 * The camera dialog and the debug panels are built from it.
 */
const props = defineProps<{
  title: string
  closable?: boolean
  /** the initial size, the panel is resizable */
  width?: number
  height?: number
}>()

const emit = defineEmits<{
  close: []
}>()

const offset = ref({ x: 0, y: 0 })
let dragStart: { pointerX: number; pointerY: number; offsetX: number; offsetY: number } | undefined

function onPointerDown(event: PointerEvent): void {
  dragStart = {
    pointerX: event.clientX,
    pointerY: event.clientY,
    offsetX: offset.value.x,
    offsetY: offset.value.y,
  }

  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent): void {
  if (dragStart === undefined) {
    return
  }

  offset.value = {
    x: dragStart.offsetX + event.clientX - dragStart.pointerX,
    y: dragStart.offsetY + event.clientY - dragStart.pointerY,
  }
}

function onPointerUp(event: PointerEvent): void {
  dragStart = undefined
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

const style = computed(() => {
  return {
    transform: `translate(${offset.value.x}px, ${offset.value.y}px)`,
    width: props.width === undefined ? undefined : `${props.width}px`,
    height: props.height === undefined ? undefined : `${props.height}px`,
  }
})
</script>

<template>
  <div class="draggable-panel" :style="style">
    <div
      class="draggable-panel__header"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="draggable-panel__title">{{ title }}</span>
      <button
        v-if="closable"
        class="draggable-panel__close"
        type="button"
        title="Close"
        @click="emit('close')"
        @pointerdown.stop
      >
        ✕
      </button>
    </div>

    <div class="draggable-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.draggable-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 21;
  display: flex;
  flex-direction: column;
  min-width: 240px;
  min-height: 60px;
  margin: -90px 0 0 -190px;
  border: 1px solid #1a1717;
  border-radius: 6px;
  background: rgb(30 27 27 / 96%);
  color: #e2d8d8;
  font-size: 13px;
  font-weight: bold;
  box-shadow: 0 6px 24px rgb(0 0 0 / 50%);
  /* the panel is resizable from its bottom right corner */
  resize: both;
  overflow: hidden;
}

.draggable-panel__header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  height: 26px;
  padding: 0 6px 0 10px;
  border-bottom: 1px solid #1a1717;
  background: #3b3535;
  border-radius: 5px 5px 0 0;
  cursor: move;
  user-select: none;
}

.draggable-panel__title {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #cfc3c3;
}

.draggable-panel__close {
  width: 22px;
  height: 22px;
  border: 1px solid #1a1717;
  border-radius: 4px;
  background: #4a4444;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.draggable-panel__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  overflow: auto;
}
</style>
