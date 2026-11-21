<script setup lang="ts">
/**
 * A sentence in the place of a list or an edit: the empty selection of the light editor, the mismatch of the fields, the
 * notice under the uv square.
 *
 * @remarks
 * The sentences are one line of text with the grey of a note. The widget owns where the sentence sits and how wide it is
 * (the padding, the centre of the uv square); the component is the text.
 */
</script>

<template>
  <p class="Notice">
    <slot />
  </p>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.Notice {
  margin: 0;
  color: $text-muted;
  font-size: 12px;
}
</style>
