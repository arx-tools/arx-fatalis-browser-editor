<script setup lang="ts">
/**
 * The title of a section inside a widget: the sentence over a group of rows (the "Manage selection" and the "Warnings"
 * of the room inspector).
 *
 * @remarks
 * The caption of a group is a small uppercase line with the quiet icon gray; the component is the heading, the widget
 * puts the rows under it.
 */
</script>

<template>
  <h3 class="SectionTitle">
    <slot />
  </h3>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.SectionTitle {
  margin: 0 0 4px;
  padding: 0 6px;
  color: $text-icon;
  font-size: 11px;
  font-weight: normal;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
</style>
