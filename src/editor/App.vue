<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue'
import Cover from './components/Cover.vue'
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import LoadingOverlay from './components/LoadingOverlay.vue'
import { startLevelDisplay } from './components/widgets/shared/levelDisplay.ts'
import { startLevelEditing } from './modules/level/edit/editing.ts'
import { startSelection } from './modules/selection/selectionStore.ts'
import { paintLevel, startLevelTextures } from './modules/level/edit/levelTextures.ts'
import { MAP_PARAMETER, mapIdFromUrl, mapSlugOf, storedMapId } from './modules/level/source/maps/mapId.ts'
import { levelStore } from './modules/level/edit/levelStore.ts'
import { startTextureCatalog } from './modules/textures/textureCatalog.ts'
import {
  DATA_DIR_PARAMETER,
  dataDirFromUrl,
  dataDirKind,
  hasDataDir,
  startDataDir,
} from './modules/level/source/dataDir.ts'
import {
  isOriginalLevelSource,
  ORIGINAL_LEVEL_PARAMETER,
  starterLevelSource,
  zipUrlFromUrl,
} from './modules/level/source/levelSource.ts'
import {
  arxLevels,
  availableMapIdOf,
  currentMapId,
  DEFAULT_MAP_ID,
  hasChangesOf,
  lastMapId,
  MAP_GROUP_PREFIXES,
  mapNeedingDataDir,
  missingDataDirMapOf,
  requestedMapId,
  openMap,
  refreshDataDir,
  rememberCustomMap,
  restorePersistedHistory,
  setStartupSource,
  startMapPersistence,
} from './modules/level/source/maps.ts'
import { startMapHistoryPersistence } from './modules/history/mapHistoryPersistence.ts'
import { getUrlAdapter, writeUrlValue } from './modules/persistedRef/url.ts'
import { isZipLevelSource } from './modules/level/source/zipSource.ts'
import { cameraAngle, cameraPosition } from './components/widgets/camera/cameraState.ts'
import { cameraStore } from './components/widgets/camera/cameraStore.ts'
import { provideEditorShell } from './modules/shell/editorShellContext.ts'

// the dock builds the shell when it is mounted, the header reads it from here
provideEditorShell()

/**
 * Whether a level is on its way in: the editor is covered while it is, with the words of the wait over the cover.
 *
 * @remarks
 * The cover is the shape the modal uses (black at 45%), and the words are white on it: the status line of the
 * walkable view is far too quiet for a wait that takes a level of the game with thirty textures.
 */
const isLevelLoading = computed(() => {
  return levelStore.status.value === 'loading'
})

// The level is loaded by the app and not by the 3D view: the widget comes and goes with the dock, and
// the map has to survive that (a layout reset rebuilds every widget). Starting it here also means the
// level is on its way before the dock asks for it.
onMounted(async () => {
  const url = getUrlAdapter(undefined)
  const zipUrl = zipUrlFromUrl(url)
  let requestedMap = mapIdFromUrl(url) ?? storedMapId()

  // a zip of the url is the map of the session: the level in it has no value in the list, and the zip is the one the
  // address bar carries (a reload downloads it again)
  if (zipUrl !== undefined) {
    requestedMap = undefined
  }

  // the data directory of the session: the url names one for this visit, or the browser has the folder of the directory
  // picker from a previous one (the IndexedDB keeps its handle — that one is read before the level, so its files are
  // there when the level arrives). The editor keeps no folder of the disk in the browser: a path is of the url only.
  const startedDataDir = await startDataDir()
  const dataDirFromUrlParameter = dataDirFromUrl(url)

  if (startedDataDir !== undefined) {
    let state = 'of the browser'

    if (dataDirKind.value === 'path') {
      state = 'of the url'
    }

    console.info(`Data dir: ${startedDataDir} (${state})`)
  }

  // the modules that follow the level start before it arrives: their watchers have to be there when it lands (and the
  // map of the url is read before the level is opened)
  startLevelDisplay()
  startSelection()
  startLevelEditing()
  startMapHistoryPersistence()
  startLevelTextures()
  startTextureCatalog()
  startMapPersistence()

  /**
   * Whether the map of the url was not in the list of the maps, so the address bar has to keep it.
   *
   * @remarks
   * The value of the url is the one the user picked the last time, and it is only a value of the list when the data
   * directory (the one of the url, or the remembered one) has the level. Without the folder there is nothing to open,
   * and the editor falls back to the default map — but the address bar keeps the value, so a visit where the folder is
   * there again opens the level that was asked for (the same rule the level of a lost folder follows).
   */
  let keepRequestedMap = false

  /**
   * Loads the level of the session: the map of the url, or the starter level (a zip, a level of the game, a blank one).
   */
  async function begin(): Promise<void> {
    // the data directory of the url has levels and textures, and the list of the maps reads the levels it has: the map
    // of the url is a value of that list, so the scan comes first
    if (hasDataDir()) {
      try {
        await refreshDataDir()
      } catch {
        // a folder that can not be read leaves the list without levels, the editor still works
      }
    }

    if (requestedMap === undefined) {
      const source = starterLevelSource(url)

      setStartupSource(source)

      if (isZipLevelSource(source)) {
        // the level of the `fromZip` url: its textures are painted before the views get the map, and a zip that does not
        // load is an error the walkable view shows (a silent blank level would hide the mistake of the url)
        await levelStore
          .openLevel(source, async (map): Promise<void> => {
            await paintLevel(map, source.data())
          })
          .catch(() => {
            // the store keeps the error of the load, the walkable view shows it
          })

        // the bytes of a zip of the url are there after the load (the source downloads it then), so the map joins the
        // list now: the select shows it, and the history of the level has a value of its own
        const data = source.data()

        if (data !== undefined) {
          currentMapId.value = rememberCustomMap(source.label, data)
        }
      } else if (isOriginalLevelSource(source)) {
        currentMapId.value = `arx:${String(source.level)}`

        // a level of the game, with the textures of the data directory of the url: nothing is downloaded, and a folder
        // that has no such level is an error the walkable view shows
        await levelStore
          .openLevel(source, async (map): Promise<void> => {
            await paintLevel(map)
          })
          .catch(() => {
            // the store keeps the error of the load, the walkable view shows it
          })
      } else {
        // the blank level of the start is painted like any other: the containers it has draw with the placeholder (the
        // editor has no texture of the game at hand), so the floor is the jorge pattern and not the bare grey of a mesh
        await levelStore
          .openLevel(source, async (map): Promise<void> => {
            await paintLevel(map)
          })
          .catch(() => {
            // the store keeps the error of the load, the walkable view shows it
          })
      }

      // a reload keeps the steps of the level: they were written down, and they come back once the level is on the
      // screen and painted (the map of the url goes through `openMap`, which restores them the same way)
      await restorePersistedHistory()
    } else {
      // a map the list does not have (a level the folder lost, a zip of a previous session) falls back to the level the
      // editor opens with; the message about it is the toast of a later round. The camera keeps the pose of the url:
      // this is a reload, not a switch
      const resolved = availableMapIdOf(requestedMap, arxLevels.value)

      await openMap(resolved ?? DEFAULT_MAP_ID, { camera: 'keep' })

      // the blank level opens, and the view says why the map of the link is not the one on the screen (the level of the
      // link needs the folder of the game, which this visit does not have). The notice is only for a folder that can not
      // come back by itself: a remembered handle asks for one press, and the header already says that
      const missing = missingDataDirMapOf(
        requestedMap,
        resolved !== undefined,
        hasDataDir(),
        dataDirKind.value === 'handle',
      )

      mapNeedingDataDir.value = undefined
      requestedMapId.value = undefined
      keepRequestedMap = resolved === undefined

      if (missing !== undefined && requestedMap !== undefined) {
        mapNeedingDataDir.value = {
          label: missing,
          name: `${MAP_GROUP_PREFIXES.arx}: ${missing}`,
          hasChanges: hasChangesOf(requestedMap),
        }
        requestedMapId.value = requestedMap
      }
    }

    if (url !== undefined) {
      // the map of the screen is a value of the list now, so the address bar carries that instead of the old parameter
      // (a reload starts from the same map). The folder of the url stays in the address bar: nothing remembers it, so a
      // link is what gives the folder of the next visit
      writeUrlValue(url, ORIGINAL_LEVEL_PARAMETER, undefined)

      // a zip of the url is the map itself: the address bar keeps it instead of a value of a list the next visit does
      // not have. A map the list did not have is kept too: the folder of the next visit may have its level
      if (zipUrl === undefined && !keepRequestedMap) {
        writeUrlValue(url, MAP_PARAMETER, mapSlugOf(currentMapId.value))
      }

      if (dataDirFromUrlParameter === undefined) {
        writeUrlValue(url, DATA_DIR_PARAMETER, undefined)
      }
    }
  }

  begin().catch(() => {
    // the store keeps the error of the load, the walkable view shows it
  })

  // the camera keeps the pose the url or the storage of the browser carries: a visit that has neither starts at the
  // spawn of the level. The map is not asked: the owner asked for the pose of the last visit to survive a visit
  // without a link, even when the map is another one.
  const stop = watch(levelStore.status, (status): void => {
    if (status !== 'ready') {
      return
    }

    stop()

    lastMapId.value = currentMapId.value

    if (cameraPosition.value !== undefined && cameraAngle.value !== undefined) {
      return
    }

    async function settle(): Promise<void> {
      await nextTick()
      cameraStore.moveToSpawn()

      if (url !== undefined) {
        writeUrlValue(url, 'position', undefined)
        writeUrlValue(url, 'rotation', undefined)
      }
    }

    settle().catch(() => {
      // the camera of the level stays where it was: the map is on the screen, which is the part that matters
    })
  })
})
</script>

<template>
  <div class="App">
    <LoadingOverlay v-if="isLevelLoading" />
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
