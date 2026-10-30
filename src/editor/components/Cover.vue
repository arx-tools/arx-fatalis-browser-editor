<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * How long the shield stays after the window got the focus back, in milliseconds.
 *
 * @remarks
 * The click that brings the window back arrives right after the focus, so the shield has to be there for it:
 * this is the time a click takes, with room to spare. After that a click is a real one again, and a click on
 * the walkable view takes the pointer as it always does.
 */
const SHIELD_LINGER = 200

/**
 * Whether the window has the focus.
 *
 * @remarks
 * It drives the **veil**: a window left alone dims after a while, like a screensaver. The veil goes away the
 * moment the window is back, and the next blur starts it from the beginning.
 */
const blurred = ref(false)

/**
 * Whether the shield is over the editor.
 *
 * @remarks
 * It is invisible, and it is there to **eat the click that brings the window back**. A click on the walkable
 * view takes the pointer at once, and the camera would jump to wherever the pointer happened to be — so the
 * first click of a returning window lands on the shield instead, and the one that comes after it (a
 * deliberate click on the view) is the one that takes the pointer.
 */
const shielded = ref(false)

/**
 * The pending hiding of the shield.
 */
let shieldTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Starts the veil, and puts the shield up.
 */
function onWindowBlur(): void {
  if (shieldTimer !== undefined) {
    clearTimeout(shieldTimer)
    shieldTimer = undefined
  }

  blurred.value = true
  shielded.value = true
}

/**
 * Takes the veil away at once, and the shield a moment later.
 */
function onWindowFocus(): void {
  blurred.value = false

  shieldTimer = setTimeout(() => {
    shielded.value = false
    shieldTimer = undefined
  }, SHIELD_LINGER)
}

onMounted(() => {
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('focus', onWindowFocus)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', onWindowBlur)
  window.removeEventListener('focus', onWindowFocus)

  if (shieldTimer !== undefined) {
    clearTimeout(shieldTimer)
    shieldTimer = undefined
  }
})
</script>

<template>
  <!--
    TEMPORARILY OFF (2026-10-31): an open devtools window counts as a blur, so the level dimmed under the
    inspector. The veil is only commented out, not deleted: it comes back when a rule tells the inspector
    apart from a window in the background. The shield stays on, because it only eats the first click.
  -->
  <!-- <div v-if="blurred" class="veil" /> -->
  <div v-if="shielded" class="shield" />
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the grey of a window left alone: it starts invisible, waits five seconds, then darkens over three - the
// screensaver of the editor. Focus takes it away at once, and the next blur starts it from the beginning
.veil {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba($surface-app, 0.6);
  opacity: 0;
  animation: veil 3s linear 5s forwards;

  // the clicks belong to the shield
  pointer-events: none;
}

// the whole window, over everything the dock draws: the first click of a window that comes back stops here,
// so a click on the walkable view can not take the pointer before the editor is the window in front
.shield {
  position: fixed;
  inset: 0;
  z-index: 1001;
  background: transparent;
  cursor: default;
}

@keyframes veil {
  to {
    opacity: 1;
  }
}
</style>
