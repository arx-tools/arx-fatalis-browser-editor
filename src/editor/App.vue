<script setup lang="ts">
import { computed, onMounted } from 'vue'
import Cover from './components/Cover.vue'
import Dock from './components/Dock.vue'
import EditorHeader from './components/EditorHeader.vue'
import LoadingOverlay from './components/LoadingOverlay.vue'
import MissingMapPrompt from './components/MissingMapPrompt.vue'
import { startLevelDisplay } from './components/widgets/shared/levelDisplay.ts'
import { startLevelEditing } from './modules/level/edit/editing.ts'
import { insertLevelFromUrl } from './modules/level/edit/insertLevel.ts'
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
  adoptHistoryOf,
  availableMapIdOf,
  currentMapId,
  currentMapManifest,
  currentMapSettings,
  DEFAULT_MAP_ID,
  hasChangesOf,
  MAP_GROUP_PREFIXES,
  mapNeedingDataDir,
  missingDataDirMapOf,
  moveCameraToPoseOfOpen,
  rememberStartupMapId,
  rememberStartupPose,
  requestedMapId,
  openMap,
  refreshDataDir,
  rememberCustomMap,
  restorePersistedHistory,
  setStartupSource,
  startMapPersistence,
  zipManifestOf,
  zipSettingsOf,
} from './modules/level/source/maps.ts'
import { migrateLegacyPose } from './modules/level/source/maps/mapPoses.ts'
import { startRoomNames } from './modules/rooms/roomNames.ts'
import { startRoomSelection } from './modules/rooms/roomSelection.ts'
import { startCurrentRoom } from './modules/rooms/roomUnderCrosshair.ts'
import { startPoseTracking } from './modules/level/source/maps/poseTracking.ts'
import { startMapHistoryPersistence } from './modules/history/mapHistoryPersistence.ts'
import { getUrlAdapter, writeUrlValue } from './modules/persistedRef/url.ts'
import { isZipLevelSource } from './modules/level/source/zipSource.ts'
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
  // the map and the pose the url names are read once, before a level is on the screen: the pose beside the map is the
  // pose of that map, and the editor writes its own map into the address bar while the level opens
  const urlMapId = mapIdFromUrl(url)
  let requestedMap = urlMapId ?? storedMapId()

  rememberStartupMapId(urlMapId)
  rememberStartupPose()

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
  startRoomSelection()
  startCurrentRoom()
  startRoomNames()
  startMapPersistence()

  // the pose the old build kept as one value goes under the map of the last visit, before the first map reads its own
  migrateLegacyPose()
  startPoseTracking()

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
          currentMapManifest.value = zipManifestOf(source)
          currentMapSettings.value = zipSettingsOf(source)
          adoptHistoryOf(currentMapId.value, source)
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

      // and the camera goes to the pose the map was left at, or to the one the url carries for it on the first open (a
      // level that did not load has no pose to take: the map on the screen keeps the camera it has)
      if (levelStore.status.value === 'ready') {
        moveCameraToPoseOfOpen(currentMapId.value)
      }
    } else {
      // a map the list does not have (a level the folder lost, a zip of a previous session) falls back to the level the
      // editor opens with; the message about it is the toast of a later round
      const resolved = availableMapIdOf(requestedMap, arxLevels.value)

      // the notice of a level that needs the folder is only for a folder that can not come back by itself: a remembered
      // handle asks for one press, and the header already says that
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
        // nothing opens: the level of the link owns the pose of the url, and a blank level under it would put the camera
        // of the link on a level it does not belong to (the author would move around at the coordinates of another
        // level). The notice waits for the answer: the folder, or a blank map
        mapNeedingDataDir.value = {
          label: missing,
          name: `${MAP_GROUP_PREFIXES.arx}: ${missing}`,
          hasChanges: hasChangesOf(requestedMap),
        }
        requestedMapId.value = requestedMap
      } else {
        // a map the list does not have (a level the folder lost, a zip of a previous session) falls back to the level the
        // editor opens with. The camera follows the pose of the opened map: the pose of the url is the one of the link,
        // and a blank level under it would put that pose on a level it does not belong to
        await openMap(resolved ?? DEFAULT_MAP_ID)
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

    // a spike (2026-11-13, the owner's idea): the geometry of another level, inserted into the map of the url. It is not a
    // part of the load, so a level the insert can not read leaves the map as it was
    await insertLevelFromUrl().catch(() => {
      // the map stays as it was
    })
  }

  begin().catch(() => {
    // the store keeps the error of the load, the walkable view shows it
  })
})
</script>

<template>
  <div class="App">
    <LoadingOverlay v-if="isLevelLoading" />
    <EditorHeader />
    <Dock />
    <Cover />
    <MissingMapPrompt />
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
