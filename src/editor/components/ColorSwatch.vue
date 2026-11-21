<script setup lang="ts">
/**
 * A patch of a color: the light of a row, the color of a room, the color the light editor picks.
 *
 * @remarks
 * The three places had the same span with the background of the color and a border, only the size and the border
 * changed. The size and the radius are the props; the border is dark for a row, strong for the big patch of the light
 * editor, and none where the color itself is the only mark.
 */
withDefaults(
  defineProps<{
    /**
     * The CSS color of the patch.
     */
    readonly color: string
    /**
     * The width and the height of the patch, in pixels.
     */
    readonly size?: number
    /**
     * The radius of the corners, in pixels.
     */
    readonly radius?: number
    /**
     * The border of the patch: the line of a row, the strong edge of the light editor, or none.
     */
    readonly border?: 'none' | 'line' | 'strong'
  }>(),
  {
    size: 10,
    radius: 2,
    border: 'none',
  },
)
</script>

<template>
  <span
    class="ColorSwatch"
    :class="`is-bordered-${border}`"
    :style="{
      backgroundColor: color,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${radius}px`,
    }"
    aria-hidden="true"
  ></span>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.ColorSwatch {
  flex: none;
  display: inline-block;
  box-sizing: border-box;

  &.is-bordered-line {
    border: 1px solid $border;
  }

  &.is-bordered-strong {
    border: 1px solid $border-strong;
  }
}
</style>
