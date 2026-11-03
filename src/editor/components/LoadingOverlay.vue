<script setup lang="ts">
/**
 * The wait of a level load, over the whole editor.
 *
 * @remarks
 * A level of the game takes a while (the textures of the data directory are read one by one), and the editor is not
 * usable until it arrives: the cover takes the clicks away from the surface behind it and dims it, and the words sit
 * **on** the cover, in white, where the eye finds them. It is a `Teleport` to the body because the header is
 * positioned with a transform, which would keep a fixed overlay under the dock.
 */
</script>

<template>
  <Teleport to="body">
    <div class="LoadingOverlay" role="status" aria-live="polite">
      <div class="cover" />
      <p class="words">Loading the level…</p>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.LoadingOverlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;

  .cover {
    position: absolute;
    inset: 0;
    background: $ink;
    opacity: 0.45;
  }

  .words {
    position: relative;
    margin: 0;
    color: $on-veil;
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-shadow: 0 1px 3px $ink;
  }
}
</style>
