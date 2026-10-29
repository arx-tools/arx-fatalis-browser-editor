<script setup lang="ts">
/**
 * The title of an info widget.
 *
 * @remarks
 * The dock hides its own tab bar in the editor, so the title of the block has to be inside the widget: an
 * info widget (`WidgetDefinition.group === 'info'`) says its name here. The text is the label of the
 * definition, which the shell passes to the component as the `label` prop.
 */
defineProps<{
  /**
   * The label of the widget, from the definition registry.
   */
  readonly label: string
}>()
</script>

<template>
  <h2 class="WidgetHeading">{{ label }}</h2>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

.WidgetHeading {
  margin: 0 0 6px;
  padding: 0 6px 5px;
  border-bottom: 1px solid $border-dark;
  color: $text-strong;
  font-size: 12px;
  font-weight: bold;
}
</style>
