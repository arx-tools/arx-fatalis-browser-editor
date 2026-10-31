<script setup lang="ts">
import { onMounted } from 'vue'
import Cover from './components/Cover.vue'
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import { startLevelDisplay } from './components/widgets/levelDisplay.ts'
import { startLevelEditing } from './modules/level/editing.ts'
import { startSelection } from './modules/selection/selectionStore.ts'
import { levelStore } from './modules/level/levelStore.ts'
import { provideEditorShell } from './modules/shell/editorShellContext.ts'

// the dock builds the shell when it is mounted, the header reads it from here
provideEditorShell()

// The level is loaded by the app and not by the 3D view: the widget comes and goes with the dock, and
// the map has to survive that (a layout reset rebuilds every widget). Starting it here also means the
// level is on its way before the dock asks for it.
onMounted(() => {
  levelStore.startLoading()
  startLevelDisplay()
  startSelection()
  startLevelEditing()
})
</script>

<template>
  <div class="App">
    <EditorHeader />
    <Dock />
    <Cover />
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
