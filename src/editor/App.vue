<script setup lang="ts">
import { onMounted } from 'vue'
import Cover from './components/Cover.vue'
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import { startLevelDisplay } from './components/widgets/levelDisplay.ts'
import { startLevelEditing } from './modules/level/editing.ts'
import { startSelection } from './modules/selection/selectionStore.ts'
import { paintZipLevel, startLevelTextures } from './modules/level/levelTextures.ts'
import { levelStore } from './modules/level/levelStore.ts'
import { starterLevelSource } from './modules/level/levelSource.ts'
import { isZipLevelSource } from './modules/level/zipSource.ts'
import { provideEditorShell } from './modules/shell/editorShellContext.ts'

// the dock builds the shell when it is mounted, the header reads it from here
provideEditorShell()

// The level is loaded by the app and not by the 3D view: the widget comes and goes with the dock, and
// the map has to survive that (a layout reset rebuilds every widget). Starting it here also means the
// level is on its way before the dock asks for it.
onMounted(() => {
  const source = starterLevelSource()

  if (isZipLevelSource(source)) {
    // the level of the `fromZip` url: its textures are painted before the views get the map, and a zip that does not
    // load is an error the walkable view shows (a silent blank level would hide the mistake of the url)
    levelStore
      .openLevel(source, async (map): Promise<void> => {
        await paintZipLevel(map, source.data())
      })
      .catch(() => {
        // the store keeps the error of the load, the walkable view shows it
      })
  } else {
    levelStore.startLoading()
  }

  startLevelDisplay()
  startSelection()
  startLevelEditing()
  startLevelTextures()
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
