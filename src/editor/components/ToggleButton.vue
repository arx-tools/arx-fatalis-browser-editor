<script setup lang="ts">
/**
 * The switch of a setting: the icon button that the lighting controls and the snapping settings share.
 *
 * @remarks
 * The two widgets had the same button twice: the box, the off and on look, the pressed state, the disabled look and the
 * icon of the library. The button is **controlled**: it emits the next value and the widget writes its own ref, so the
 * stored setting stays the one the widget owns (the same rule as {@link FieldLabel}: the bindings are the widget's).
 *
 * The tooltip is the *next* action when the widget says one, and the label otherwise: the label names the switch for the
 * screen reader, the tooltip says what a click does. The icon is the slot, so the same switch carries the power of a
 * light layer, the snapping, or any other mark of a setting (2026-11-21, the owner).
 */
const props = withDefaults(
  defineProps<{
    /**
     * Whether the switch is on.
     */
    readonly pressed: boolean
    /**
     * The name of the switch, for the screen reader and the default tooltip.
     */
    readonly label: string
    /**
     * What a click does, when it is not the label itself.
     */
    readonly tooltip?: string
    /**
     * Whether the switch can be pressed: a kind of a snap is off while its master switch is off.
     */
    readonly disabled?: boolean
    /**
     * The colour pair of the switch: the accent of a setting, the green of a lock, or the quiet grey of a tool.
     */
    readonly tone?: 'accent' | 'ok' | 'quiet'
    /**
     * Where the tooltip stands, when the switch sits at the edge of its view (the magnet of the walkable view).
     */
    readonly tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right'
  }>(),
  {
    tooltip: undefined,
    disabled: false,
    tone: 'accent',
    tooltipPlacement: undefined,
  },
)

/**
 * The next value of the switch.
 */
const emit = defineEmits<{
  'update:pressed': [value: boolean]
}>()

/**
 * Asks the widget for the other state of the switch.
 */
function toggle(): void {
  emit('update:pressed', !props.pressed)
}
</script>

<template>
  <button
    class="ToggleButton"
    :class="[`tone-${tone}`, { 'is-on': pressed }]"
    type="button"
    :disabled="disabled"
    :aria-pressed="pressed"
    :aria-label="label"
    v-tooltip="{ content: tooltip ?? label, placement: tooltipPlacement }"
    @click="toggle"
  >
    <slot v-if="pressed" name="on"><slot /></slot>
    <slot v-else name="off"><slot /></slot>
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the switch of a setting (2026-11-18, the owner): no plate of its own, the dark background of the panel shows
// through; a faint border and a grey icon while it is off, a lighter border and the accent while it is on, and the grey
// of the panel under the pointer. A disabled switch keeps its state visible and dims itself: the kinds of the snap stay
// where the author left them while the master is off.
.ToggleButton {
  display: inline-flex;
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

  &:hover {
    background: $surface-panel;
  }

  &:focus-visible {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }

  &.is-on {
    border-color: $border-strong;
  }

  &.tone-accent.is-on {
    color: $accent;
  }

  // the lock of the layout: green while the layout is locked, the accent (and the raised plate) while the edit mode is
  // on
  &.tone-ok {
    color: $ok;
  }

  &.tone-ok.is-on {
    color: $accent;
    background: $surface-raised;
  }

  // the tools of the header: the quiet icon, and the strong one with the raised plate while the popup is open
  &.tone-quiet {
    color: $text-icon;
  }

  &.tone-quiet.is-on {
    color: $text-strong;
    background: $surface-raised;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}
</style>
