<script setup lang="ts">
/**
 * A small tool of a toolbar: the flat icon button of the uv mapper's turns.
 *
 * @remarks
 * The button is a 22x20 plate with a quiet icon and the panel of the widget under the pointer; the icon is the slot, the
 * label names the tool and is the default tooltip. A tool that only works on a quad (the quarter and the stretch of the
 * uv mapper) is disabled, and keeps its place with the dimmed look.
 */
withDefaults(
  defineProps<{
    /**
     * The name of the tool, for the screen reader and the default tooltip.
     */
    readonly label: string
    /**
     * What the tool does, when it needs more than its name.
     */
    readonly tooltip?: string
    /**
     * Whether the tool can be pressed.
     */
    readonly disabled?: boolean
  }>(),
  {
    tooltip: undefined,
    disabled: false,
  },
)
</script>

<template>
  <button class="ToolButton" type="button" :disabled="disabled" :aria-label="label" v-tooltip="tooltip ?? label">
    <slot />
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.ToolButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 20px;
  padding: 0;
  color: $text-icon;
  background: $surface-panel;
  border: 1px solid $border-dark;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: $text-strong;
    background: $surface-widget;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>
