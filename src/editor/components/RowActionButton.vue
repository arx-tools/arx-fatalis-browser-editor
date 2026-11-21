<script setup lang="ts">
/**
 * One action of a row: the eye, the magnifier, the pencil and the trash of the group and room lists.
 *
 * @remarks
 * The two lists had the same four buttons six times: the 20 pixel square, the quiet grey of an icon, the panel under the
 * pointer, the accent of the eye that is on, and the danger of the trash. The component is the button and the look; the
 * icon is the slot, the row keeps the action and its condition (the rename, the jump, the delete).
 *
 * The tooltip is the label when the widget has nothing more to say, and the `aria-pressed` of a toggle (the eye) only
 * appears where the widget passes `pressed`: the other actions are not toggles.
 */
withDefaults(
  defineProps<{
    /**
     * The name of the action, for the screen reader and the default tooltip.
     */
    readonly label: string
    /**
     * What a click does, when it is not the label itself.
     */
    readonly tooltip?: string
    /**
     * The state of a toggle action (the eye): the button reads pressed, and shows the accent.
     */
    readonly pressed?: boolean
    /**
     * Whether the action stays in the background until the pointer reaches it: the rename, the jump and the delete.
     */
    readonly muted?: boolean
    /**
     * Whether the hover of the action is the danger colour: the delete of a row.
     */
    readonly danger?: boolean
    /**
     * Whether the action can be pressed.
     */
    readonly disabled?: boolean
  }>(),
  {
    tooltip: undefined,
    pressed: undefined,
    muted: false,
    danger: false,
    disabled: false,
  },
)
</script>

<template>
  <button
    class="RowActionButton"
    :class="{ 'is-pressed': pressed, 'is-muted': muted, 'is-danger': danger }"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="pressed"
    v-tooltip="tooltip ?? label"
  >
    <slot />
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the action of a row: no plate of its own while the pointer is away, the panel under it, and the text of the row under
// the pointer. The eye that is on takes the accent; the rename, the jump and the delete are quieter (0.6) and come
// forward under the pointer; the delete takes the danger colour on the hover.
.RowActionButton {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: $text-subtle;
  background: none;
  border: 0;
  border-radius: 3px;
  cursor: pointer;

  &:hover:not(:disabled) {
    color: $text;
    background: $surface-panel;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &.is-pressed {
    color: $accent;
  }

  &.is-muted {
    opacity: 0.6;

    &:hover:not(:disabled) {
      opacity: 1;
    }
  }

  &.is-danger:hover:not(:disabled) {
    color: $danger-bright;
  }
}
</style>
