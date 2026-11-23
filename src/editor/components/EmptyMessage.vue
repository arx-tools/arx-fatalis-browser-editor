<script setup lang="ts">
/**
 * The line a list shows when it is empty: no light, no room, no face, or a filter that lets nothing through.
 *
 * @remarks
 * The four lists of the inspectors had their own paragraph, with a margin and a gray of its own. The message is the
 * slot; the look is one, so a list that empties reads the same wherever it is.
 */
</script>

<template>
  <p class="EmptyMessage">
    <slot />
  </p>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.EmptyMessage {
  margin: 4px 0 0;
  color: $text-subtle;
  font-size: 11px;
}
</style>
