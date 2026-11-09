<script setup lang="ts">
import { onBeforeUnmount, onMounted, shallowRef } from 'vue'

/**
 * The wait of a level load, over the whole editor.
 *
 * @remarks
 * A level of the game takes a while (the textures of the data directory are read one by one), and the editor is not
 * usable until it arrives: the cover takes the clicks away from the surface behind it and dims it, and the words sit
 * **on** the cover, in white, where the eye finds them. It is a `Teleport` to the body because the header is
 * positioned with a transform, which would keep a fixed overlay under the dock.
 *
 * The words are placed on the **walkable view** (2026-11-09, the owner): the level arrives for that view, and a line in
 * the middle of the whole window sits over the numbers and the panels, where nothing is coming. The view is looked up by
 * its kind, and the words fall back to the middle of the window while the dock has no such widget.
 */

/**
 * The middle of the walkable view, in the pixels of the window.
 */
const spot = shallowRef<{ x: number; y: number } | undefined>(undefined)

/**
 * An observer of the widget, for a drag of the dock while the level loads.
 */
let observer: ResizeObserver | undefined

/**
 * Reads the middle of the walkable view.
 */
function measure(): void {
  const view = document.querySelector('[data-widget-kind="3d-view"]')
  const box = view?.getBoundingClientRect()

  if (box === undefined) {
    spot.value = undefined

    return
  }

  const halfWidth = box.width / 2
  const halfHeight = box.height / 2

  spot.value = { x: box.x + halfWidth, y: box.y + halfHeight }
}

onMounted(() => {
  measure()

  const view = document.querySelector('[data-widget-kind="3d-view"]')

  if (view !== null && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      measure()
    })
    observer.observe(view)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = undefined
})
</script>

<template>
  <Teleport to="body">
    <div class="LoadingOverlay" role="status" aria-live="polite">
      <div class="cover" />
      <p class="words" :style="spot === undefined ? {} : { left: `${spot.x}px`, top: `${spot.y}px` }">
        Loading the level…
      </p>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.LoadingOverlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;

  .cover {
    position: absolute;
    inset: 0;
    background: $ink;
    opacity: 0.45;
  }

  // the words sit over the walkable view: the widget gives them a middle in the pixels of the window, and the words
  // fall back to the middle of the cover while the dock has no such widget
  .words {
    position: fixed;
    margin: 0;
    transform: translate(-50%, -50%);
    color: $on-veil;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 3px $ink;
  }
}
</style>
