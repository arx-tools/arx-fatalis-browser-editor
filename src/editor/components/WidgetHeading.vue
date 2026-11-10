<script setup lang="ts">
/**
 * The title of an info widget.
 *
 * @remarks
 * The dock hides its own tab bar in the editor, so the title of the block has to be inside the widget: an
 * info widget (`WidgetDefinition.group === 'info'`) says its name here. The text is the label of the
 * definition, which the shell passes to the component as the `label` prop.
 *
 * A widget that owns a switch puts it in the `actions` slot: the button sits on the right of the title, in the
 * same line, so it belongs to the heading and not to the list under it.
 */
defineProps<{
  /**
   * The label of the widget, from the definition registry.
   */
  readonly label: string
}>()
</script>

<template>
  <div class="WidgetHeading">
    <h2 class="title">{{ label }}</h2>
    <div v-if="$slots.actions" class="actions">
      <slot name="actions"></slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.WidgetHeading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
  padding: 0 6px 5px;
  border-bottom: 1px solid $border-dark;
  color: $text-strong;
  font-size: 12px;
  font-weight: bold;

  .title {
    flex: 1;
    margin: 0;
    font: inherit;
  }

  .actions {
    display: flex;
    flex: none;
    align-items: center;
  }
}
</style>
