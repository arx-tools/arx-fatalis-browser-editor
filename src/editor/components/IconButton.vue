<script setup lang="ts">
/**
 * A small icon button of a heading or of a row, without a state: the clear, the reset, the add.
 *
 * @remarks
 * The widget headings and the rows of the lists had the same 26×22 box four times (the reset of the key help, the undo
 * and the redo of its rows, the add of the group inspector), each with its own frame, hover and disabled look. The box is
 * the one of {@link ToggleButton}, so a switch and a command of the same size read the same in a row; the button has no
 * state of its own, the widget owns the action and its condition (2026-11-25, the owner).
 *
 * The label names the action for the screen reader, and it is the default tooltip; a tooltip says what a click does when
 * the label alone is not enough.
 */
withDefaults(
  defineProps<{
    /**
     * The name of the action, for the screen reader and the default tooltip.
     */
    readonly label: string
    /**
     * What a click does, when it needs more than the name.
     */
    readonly tooltip?: string
    /**
     * Whether the button can be pressed.
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
  <button class="IconButton" type="button" :disabled="disabled" :aria-label="label" v-tooltip="tooltip ?? label">
    <slot />
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the box of a switch (ToggleButton) and of a command of a heading: the dark of the panel shows through, a faint border,
// the quiet icon, and the gray of the panel under the pointer. A disabled command dims itself and keeps its place.
.IconButton {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  padding: 0;
  border: 1px solid $border;
  border-radius: 4px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-panel;
  }

  &:focus-visible {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
