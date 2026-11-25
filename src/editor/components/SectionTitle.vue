<script setup lang="ts">
/**
 * The title of a section inside a widget: the sentence over a group of rows (the "Manage selection" and the "Warnings"
 * of the room inspector, the groups of the selection inspector).
 *
 * @remarks
 * The caption of a group is a small uppercase line with the quiet icon gray; the component is the heading, the widget
 * puts the rows under it. A section may carry a count on the right (the faces of a group), the way the rows of the lists
 * do: the `value` is the same kind of number the accordions show (2026-11-25, the owner: one caption, not three).
 */
withDefaults(
  defineProps<{
    /**
     * The number of the section, on the right of the caption, when it has one.
     */
    readonly value?: string
  }>(),
  { value: undefined },
)
</script>

<template>
  <h3 class="SectionTitle">
    <span class="label"><slot /></span>
    <span v-if="value !== undefined" class="value">{{ value }}</span>
  </h3>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.SectionTitle {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  margin: 0 0 4px;
  padding: 0 6px;
  color: $text-icon;
  font-size: 11px;
  font-weight: normal;
  letter-spacing: 0.04em;
  text-transform: uppercase;

  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // the number of the group: the quiet end of the row, the same gray the counts of the sections use
  .value {
    flex: none;
    color: $text-subtle;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    // the count keeps its own case: `1 entity`, not the uppercase of the caption
    text-transform: none;
  }
}
</style>
