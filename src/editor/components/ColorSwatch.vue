<script setup lang="ts">
import { computed } from 'vue'

/**
 * A patch of a color: the light of a row, the color of a room, the color the light editor picks.
 *
 * @remarks
 * The three places had the same span with the background of the color and a border, only the size and the border
 * changed. The size and the radius are the props; the border is dark for a row, strong for the big patch of the light
 * editor, and none where the color itself is the only mark.
 */
const props = withDefaults(
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
    /**
     * Whether the patch fills its box instead of keeping the size.
     *
     * @remarks
     * The light editor puts the patch beside the three sliders of the color, as tall as them: the box comes from the
     * parent, and the patch fills it (2026-11-23, the owner).
     */
    readonly fill?: boolean
  }>(),
  {
    size: 10,
    radius: 2,
    border: 'none',
    fill: false,
  },
)

/**
 * The style of the patch: the color, the radius, and the size (or the full box when it fills).
 */
const patchStyle = computed(() => {
  const style: Record<string, string> = {
    backgroundColor: props.color,
    borderRadius: `${props.radius}px`,
  }

  if (props.fill) {
    style.width = '100%'
    style.height = '100%'

    return style
  }

  style.width = `${props.size}px`
  style.height = `${props.size}px`

  return style
})
</script>

<template>
  <span
    class="ColorSwatch"
    :class="[`is-bordered-${border}`, { 'is-fill': fill }]"
    :style="patchStyle"
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

  &.is-fill {
    display: block;
  }
}
</style>
