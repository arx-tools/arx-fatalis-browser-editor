<script setup lang="ts">
import { onMounted } from 'vue'
import Cover from './components/Cover.vue'
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import { startLevelDisplay } from './components/widgets/levelDisplay.ts'
import { startLevelEditing } from './modules/level/editing.ts'
import { startSelection } from './modules/selection/selectionStore.ts'
import { paintLevel, startLevelTextures } from './modules/level/levelTextures.ts'
import { levelStore } from './modules/level/levelStore.ts'
import { DATA_DIR_PARAMETER, dataDirFromUrl, hasDataDir, startDataDir, storedDataDir } from './modules/level/dataDir.ts'
import { isOriginalLevelSource, ORIGINAL_LEVEL_PARAMETER, starterLevelSource } from './modules/level/levelSource.ts'
import { currentMapId, refreshDataDir, rememberCustomMap, setStartupSource } from './modules/level/maps.ts'
import { getUrlAdapter, writeUrlValue } from './modules/persistedRef/url.ts'
import { isZipLevelSource } from './modules/level/zipSource.ts'
import { provideEditorShell } from './modules/shell/editorShellContext.ts'

// the dock builds the shell when it is mounted, the header reads it from here
provideEditorShell()

// The level is loaded by the app and not by the 3D view: the widget comes and goes with the dock, and
// the map has to survive that (a layout reset rebuilds every widget). Starting it here also means the
// level is on its way before the dock asks for it.
onMounted(() => {
  const source = starterLevelSource()
  const url = getUrlAdapter(undefined)

  setStartupSource(source)

  // the data directory of the session: the url names one (and it is remembered for the next visits), or the browser
  // has the folder from a previous one
  const startedDataDir = startDataDir()
  const dataDirFromUrlParameter = dataDirFromUrl(url)

  if (startedDataDir !== undefined) {
    let state = 'not remembered'

    if (storedDataDir() === startedDataDir) {
      state = 'remembered'
    }

    console.info(`Data dir: ${startedDataDir} (${state})`)
  }

  // the data directory of the url has levels and textures, and the list of the maps reads the levels it has
  if (hasDataDir()) {
    refreshDataDir().catch(() => {
      // a folder that can not be read leaves the list without levels, the editor still works
    })
  }

  if (isZipLevelSource(source)) {
    // the level of the `fromZip` url: its textures are painted before the views get the map, and a zip that does not
    // load is an error the walkable view shows (a silent blank level would hide the mistake of the url)
    const data = source.data()

    if (data !== undefined) {
      currentMapId.value = rememberCustomMap(source.label, data)
    }

    levelStore
      .openLevel(source, async (map): Promise<void> => {
        await paintLevel(map, source.data())
      })
      .catch(() => {
        // the store keeps the error of the load, the walkable view shows it
      })
  } else if (isOriginalLevelSource(source) && hasDataDir()) {
    currentMapId.value = `arx:${String(source.level)}`

    // a level of the game, with the textures of the data directory of the url: nothing is downloaded, and a folder
    // that has no such level is an error the walkable view shows
    levelStore
      .openLevel(source, async (map): Promise<void> => {
        await paintLevel(map)
      })
      .catch(() => {
        // the store keeps the error of the load, the walkable view shows it
      })
  } else {
    levelStore.startLoading()
  }

  // the level the url names is on its way to the list of the header: the address bar does not need to keep the parameter
  // (a reload starts from the blank level, or from what the url says; the persistence of the level is a later round).
  // It comes after the loading above: `startLoading` reads the url when it is called.
  if (url !== undefined) {
    writeUrlValue(url, ORIGINAL_LEVEL_PARAMETER, undefined)

    // the folder is in the local storage of the browser, not in the address bar: a link does not carry it (the next
    // visit reads it from the storage) — but only when the storage **holds** it: a browser that refuses to write would
    // lose the folder for the next visit, so the parameter stays in the url then
    if (dataDirFromUrlParameter === undefined || storedDataDir() === startedDataDir) {
      writeUrlValue(url, DATA_DIR_PARAMETER, undefined)
    }
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
