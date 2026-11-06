<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted } from 'vue'

/**
 * A dialog over the whole editor, with a cover that keeps the clicks away from what is under it.
 *
 * @remarks
 * The editor is a dense surface of small targets, so a dialog is not a card that floats: the cover takes every click
 * (nothing behind it reacts while it is open) and dims the screen a little, so the dialog is what the eye finds. It
 * closes with the **X** of its corner, with **Escape**, or with a click on the **cover** (2026-11-06: a dialog that does
 * not wait for a critical answer gets out of the way by a click) — and a dialog that needs an answer puts its buttons in
 * the `actions` slot.
 */
defineProps<{
  /**
   * The title of the dialog.
   */
  readonly title: string
}>()

const emit = defineEmits<{
  /**
   * The dialog asks to be closed.
   */
  close: []
}>()

/**
 * Closes the dialog on Escape.
 *
 * @param event The key press of the window.
 */
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  globalThis.addEventListener('keydown', onKey)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onKey)
})
</script>

<template>
  <!-- the dialog goes to the body: the header of the editor is positioned with a transform, and a `fixed` child of it
       would be laid out inside the header instead of over the page (the dock would paint over the dialog) -->
  <Teleport to="body">
    <div class="Modal">
      <div class="cover" @click="emit('close')" />
      <div class="dialog" role="dialog" aria-modal="true" :aria-label="title">
        <header class="head">
          <h2>{{ title }}</h2>
          <button class="close" type="button" aria-label="Close" @click="emit('close')">
            <X :size="14" />
          </button>
        </header>
        <div class="body">
          <slot />
        </div>
        <footer v-if="$slots.actions" class="actions">
          <slot name="actions" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.Modal {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  // the cover is under the dialog and over everything else: a click that is not on the dialog gets nothing
  .cover {
    position: absolute;
    inset: 0;
    background: $ink;
    opacity: 0.45;
  }

  .dialog {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(520px, 90vw);
    max-height: 80vh;
    color: $text;
    background: $surface-float;
    border: 1px solid $border-dark;
    border-radius: 6px;
    box-shadow: 0 8px 30px $ink;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid $border-dark;
  }

  h2 {
    margin: 0;
    font-size: 1em;
    font-weight: 600;
  }

  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: transparent;
    border: 0;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }
  }

  .body {
    overflow: auto;
    padding: 10px 12px;
    font-size: 0.92em;
    line-height: 1.45;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid $border-dark;
  }
}
</style>
