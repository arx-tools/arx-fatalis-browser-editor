<script setup lang="ts">
/**
 * One row of an inspector list: the group, the room and the light lists have the same row.
 *
 * @remarks
 * The row is a flex line with the 8px gap, the 3px/6px padding, the faint stripe of the even rows and the panel under the
 * pointer. The row's own colour, the accent of the selected one and the classes the list needs (`group`, `room`, `light`)
 * stay with the widget: the component is the line, and the widget puts the content and the meaning in it (2026-11-21).
 *
 * The root is the `li` of the list, so the component sits in the `v-for` of the widget's `ul`, and the click, the double
 * click and the hover of the row come through the attributes.
 */
</script>

<template>
  <li class="InspectorRow">
    <slot />
  </li>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the line of a list row: the stripe of the even rows and the wash of the pointer are the same in the three lists; the
// widgets keep their own colour, the accent of the selection and the radius or the padding where they differ.
.InspectorRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  cursor: pointer;

  &:nth-child(even) {
    background: rgba($text-strong, 0.03);
  }

  &:hover {
    background: $surface-panel;
  }
}
</style>
