<script setup lang="ts">
/**
 * A control with its caption above it.
 *
 * @remarks
 * The two thin widgets of the dock (the camera form and the jump) are a row of controls, and every one of
 * them carries a small caption: a word beside the control would take the width its value needs, and the
 * caption above keeps the row thin. The component is only that shell — the caption, the cell and the two
 * pixels between them. The control itself is the slot, so its value, its validation and its events stay in
 * the widget that owns them.
 *
 * The caption is a `<label>`: with {@link for} it names the control in the slot, and a click on it focuses
 * that control, so the whole cell is one hit area.
 *
 * The caption can also sit **beside** the control ({@link inline}), the way the lighting and the snapping settings read:
 * the settings are one line per row, and a caption above the control would need a second line the presets do not give
 * them (2026-11-18, the owner). The column of the caption is the same 72 pixels the two widgets had before the extraction,
 * so the controls of the rows still start at the same x.
 */
defineProps<{
  /**
   * The text of the caption.
   */
  readonly label: string
  /**
   * The id of the control the caption belongs to.
   */
  readonly for?: string
  /**
   * Whether the caption sits beside the control (the settings rows), or above it (the thin widgets).
   */
  readonly inline?: boolean
}>()
</script>

<template>
  <div class="FieldLabel" :class="{ 'is-inline': inline }">
    <label class="caption" :for="for">{{ label }}</label>
    <slot />
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the cell: the caption above the control, tight enough to fit the 44px of a thin strip
.FieldLabel {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
}

// the row of a setting: the caption in a fixed column, the control beside it. The caption is the same size as the one
// above a control, only the direction changes; the 8px gap is the one the two widgets used between the caption and the
// control.
.FieldLabel.is-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;

  .caption {
    flex: none;
    width: 72px;
    padding-left: 0;
    white-space: nowrap;
  }
}

// the 1px is optical: the control below has a 1px border, so a caption that starts at the same x value as
// the control looks like it hangs out to the left (the `J` of "Jump to" the most)
.caption {
  padding-left: 1px;
  color: $text-muted;
  font-size: 10px;
  line-height: 1;
}
</style>
