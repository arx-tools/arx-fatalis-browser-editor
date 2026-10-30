<script setup lang="ts">
/**
 * The mark of the middle of a view.
 *
 * @remarks
 * A static layer over the canvas: a small plus where the view looks. It takes no pointer events, so the
 * click that locks the pointer (and the pick under it) still reaches the canvas. The views hide it while
 * the level loads, when the status text sits in the same place.
 */
</script>

<template>
  <div class="Crosshair" aria-hidden="true" />
</template>

<style scoped lang="scss">
@use '../palette' as *;

.Crosshair {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 13px;
  height: 13px;
  transform: translate(-50%, -50%);
  pointer-events: none;

  // the two lines of the plus, with a shadow so they read on a bright level and on the dark space alike
  &::before,
  &::after {
    position: absolute;
    content: '';
    background: rgba($text-strong, 0.9);
    box-shadow: 0 0 2px rgba($surface-app, 0.9);
  }

  &::before {
    top: 0;
    left: 6px;
    width: 1px;
    height: 100%;
  }

  &::after {
    top: 6px;
    left: 0;
    width: 100%;
    height: 1px;
  }
}
</style>
