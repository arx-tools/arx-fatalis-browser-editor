<script setup lang="ts">
import { helpPopupOpen } from '../modules/help/helpPopup.ts'
import Modal from './Modal.vue'
import KeyboardShortcutsWidget from './widgets/KeyboardShortcutsWidget/KeyboardShortcutsWidget.vue'

/**
 * The keys of the editor, as a dialog over the editor (TODO 187).
 *
 * @remarks
 * The dialog is the `Modal` of the editor, so the cover takes the clicks and the `X`, the `Escape` and a click on the
 * cover close it; the list inside is the widget of the dock, which draws no heading of its own here — the title of the
 * dialog is the heading. The `H` of the keyboard flips the store, and a button of the list works as it does in the dock.
 */
function close(): void {
  helpPopupOpen.value = false
}
</script>

<template>
  <Modal v-if="helpPopupOpen" title="Keyboard Shortcuts" @close="close">
    <KeyboardShortcutsWidget label="Keyboard Shortcuts" :heading="false" />
  </Modal>
</template>

<style scoped lang="scss">
// the body of the dialog keeps the padding of the list, and the list scrolls inside it when the window is short
:deep(.KeyboardShortcutsWidget) {
  height: auto;
}
</style>
