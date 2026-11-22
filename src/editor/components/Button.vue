<script setup lang="ts">
/**
 * The wide button of a dialog's footer: the export of the export map, and the action of the next dialog.
 *
 * @remarks
 * The button takes the whole width of the footer, the raised plate and the strong border, and the mark of its state is
 * the tone: the plain one, the `ok` of a finished action and the `danger` of a failed one. The icon is the slot; the
 * label is the prop.
 */
withDefaults(
  defineProps<{
    /**
     * The text of the button.
     */
    readonly label: string
    /**
     * The tone of the button: the plain plate, the finished action, or the failed one.
     */
    readonly tone?: 'plain' | 'ok' | 'danger'
    /**
     * Whether the button can be pressed (a running action).
     */
    readonly disabled?: boolean
  }>(),
  {
    tone: 'plain',
    disabled: false,
  },
)
</script>

<template>
  <button class="Button" :class="`is-${tone}`" type="button" :disabled="disabled">
    <slot />
    <span>{{ label }}</span>
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.Button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  color: $text-strong;
  font: inherit;
  background: $surface-raised;
  border: 1px solid $border-strong;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-float;
    border-color: $interactive;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.is-ok {
    color: $ok;
  }

  &.is-danger {
    color: $danger-bright;
  }
}
</style>
