<script setup lang="ts">
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import { provideEditorShell } from './modules/shell/editorShellContext.ts'

// the dock builds the shell when it is mounted, the header reads it from here
provideEditorShell()
</script>

<template>
  <div class="App">
    <EditorHeader />
    <Dock />
  </div>
</template>

<style scoped lang="scss">
// The shell is a flex column: the header keeps its height, the dock takes the rest.
.App {
  display: flex;
  flex-direction: column;
  height: 100%;
}
</style>
