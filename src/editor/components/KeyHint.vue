<script setup lang="ts">
/**
 * The key of an action, in parentheses and fainter than the name of the action.
 *
 * @remarks
 * The menu row and the button say what they do, and the key of the same action follows in the parentheses, a step
 * quieter than the name: the undo button writes `Undo (Ctrl+Z)`, the row of a preset `Lighter (F5)` (2026-11-22, the
 * owner: the two read as one thing, and the key is the second half of it).
 */
defineProps<{
  /**
   * The key to write, already in the words of the platform, like `F5` or `Ctrl+Z`.
   */
  readonly text: string
}>()
</script>

<template>
  <span class="KeyHint">({{ text }})</span>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the hint of a key: the same size as the label it follows, a fainter color, and it never wraps away from it
.KeyHint {
  color: $text-muted;
  white-space: nowrap;
}
</style>
