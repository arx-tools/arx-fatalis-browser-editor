<script setup lang="ts">
import EditorHeader from './components/EditorHeader.vue'
</script>

<template>
  <div class="shell">
    <EditorHeader />

    <main class="shell-dock">
      <p class="shell-placeholder">
        The dock goes here.
        <small>(the layout editor, the widget registry and the panel persistence come next)</small>
      </p>
    </main>
  </div>
</template>
