<script setup lang="ts">
import { Check, FolderOpen, HelpCircle, X } from 'lucide-vue-next'
import { computed, ref, useTemplateRef } from 'vue'
import { dataDirState, setPickedDataDir, type DataDirFile } from '../modules/level/source/dataDir.ts'
import { paintLevel, repaintLevelTextures } from '../modules/level/edit/levelTextures.ts'
import { starterLevelSource } from '../modules/level/source/levelSource.ts'
import { getUrlAdapter } from '../modules/persistedRef/url.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import { isZipLevelSource } from '../modules/level/source/zipSource.ts'
import {
  availableMapIdOf,
  arxLevels,
  currentMapId,
  forgetArxLevels,
  mapIdFromUrl,
  openMap,
  refreshDataDir,
  startupSource,
} from '../modules/level/source/maps.ts'
import Modal from './Modal.vue'

/**
 * The data directory of the game: the folder the level files and the textures are read from.
 *
 * @remarks
 * The label, a `?` that says what the folder is (and what the browser asks when it is picked), the button of the
 * folder, and a mark that says whether the editor has one: a red cross without, a green check with it. A picked folder
 * is read on the page (the browser gives the files of it, nothing is uploaded), and the editor paints the level again
 * with the textures of the folder — or loads it, when it could not be without one.
 */
const dirInput = useTemplateRef<HTMLInputElement>('dirInput')

/**
 * Whether the editor has a data directory: the url named one, the browser remembered one, or the user picked one.
 *
 * @remarks
 * It follows the state of the folder of the module: the header is set up before the app starts the folder, so a value
 * read once would say "no folder" on the first visit with a url that names one.
 */
const hasFolder = computed(() => {
  return dataDirState.value !== undefined
})

/**
 * Whether the explanation of the folder is open.
 */
const isExplaining = ref(false)

/**
 * The class of the mark: the green check or the red cross of the state.
 */
const stateClass = computed(() => {
  let name = 'is-missing'

  if (hasFolder.value) {
    name = 'is-set'
  }

  return name
})

/**
 * What the mark says, for a reader that can not see the icon.
 */
const stateLabel = computed(() => {
  let label = 'No data directory'

  if (hasFolder.value) {
    label = 'A data directory is set'
  }

  return label
})

/**
 * Opens the folder picker of the data directory.
 */
function chooseDir(): void {
  dirInput.value?.click()
}

/**
 * Reads the folder the user picked as the data directory of the game.
 *
 * @remarks
 * The files come with the page: a `webkitdirectory` input gives the whole tree, and the editor reads what it needs from
 * it (`dataDir.ts` keeps the index by path). The level on the screen is painted again with the textures of the folder —
 * or loaded, when it could not be without one — and the list of the header looks for the levels of the folder.
 *
 * @param event The change of the input.
 */
async function loadDir(event: Event): Promise<void> {
  const input = event.target

  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const chosen = input.files

  // the input keeps its value otherwise, so the same folder could not be opened twice
  input.value = ''

  if (chosen === null || chosen.length === 0) {
    return
  }

  const files: DataDirFile[] = []
  let name = 'the data dir'

  for (const file of chosen) {
    // the relative path starts with the folder the user picked: the data dir itself is the root of a path
    const parts = file.webkitRelativePath.split('/')

    name = parts[0] ?? name
    parts.shift()
    files.push({ path: parts.join('/'), file })
  }

  setPickedDataDir(files, name)
  forgetArxLevels()
  console.info(`Data dir: ${name}, ${String(files.length)} files.`)

  // the list of the maps follows the folder: the levels it has are what it can open
  await refreshDataDir()

  // the map of the url waited for the folder: the address bar kept it while the list did not have its level, so the
  // level that was asked for opens now instead of the one the editor started with
  const requested = mapIdFromUrl(getUrlAdapter(undefined))
  let available: string | undefined

  if (requested !== undefined) {
    available = availableMapIdOf(requested, arxLevels.value)
  }

  if (available !== undefined && available !== currentMapId.value) {
    await openMap(available, { camera: 'keep' })

    return
  }

  if (levelStore.map.value === undefined) {
    // the level could not load without the folder: now it can (the source the editor started with: the url does not
    // keep the name of the level any more)
    const source = startupSource() ?? starterLevelSource()
    let zipData: ArrayBuffer | undefined

    if (isZipLevelSource(source)) {
      zipData = source.data()
    }

    await levelStore.openLevel(source, async (map): Promise<void> => {
      await paintLevel(map, zipData)
    })

    return
  }

  await repaintLevelTextures()
}
</script>

<template>
  <div class="DataDirPicker">
    <span class="label">set Arx data dir</span>
    <button class="what" type="button" aria-label="What is the data directory?" @click="isExplaining = true">
      <HelpCircle :size="14" />
    </button>
    <button
      class="open-data-dir"
      type="button"
      v-tooltip="'Pick the data directory of the game'"
      aria-label="Pick the data directory of the game"
      @click="chooseDir"
    >
      <FolderOpen :size="14" />
    </button>
    <span class="state" :class="stateClass" :aria-label="stateLabel">
      <Check v-if="hasFolder" :size="13" />
      <X v-else :size="13" />
    </span>
    <input
      ref="dirInput"
      class="dir-input"
      type="file"
      webkitdirectory
      aria-label="The data directory of the game"
      @change="loadDir"
    />

    <Modal v-if="isExplaining" title="What is the Arx data dir?" @close="isExplaining = false">
      <p>
        The level files of Arx Fatalis and the textures it draws with are in the folder the game keeps its data in
        (<code>graph/levels/…</code>, <code>graph/obj3d/textures/…</code>). The editor can not read a folder of your
        disk by itself: pick it here, and every level and texture it needs is read from it.
      </p>
      <p>
        The browser asks whether the site may read every file of the folder. <strong>Nothing is uploaded</strong>: the
        files stay on your disk, the page gets a handle of each one, and the editor reads only the few it needs (the
        level files and the textures of the level on the screen).
      </p>
      <p>
        The folder is remembered for the session: a reload asks for it again (the level in the url, a later round, will
        not).
      </p>
      <p>
        What the folders of the game are and where they live is on the wiki:
        <a
          class="about"
          href="https://wiki.arx-libertatis.org/Data_directories"
          target="_blank"
          rel="noopener noreferrer"
        >
          Data directories
        </a>
      </p>
      <template #actions>
        <button class="close-help" type="button" @click="isExplaining = false">Got it</button>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the way in of the game's own files, beside the level: the label, what it is, the folder, and whether there is one
.DataDirPicker {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    white-space: nowrap;
    opacity: 0.65;
  }

  .what,
  .open-data-dir {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text-icon;
    background: transparent;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }
  }

  .what {
    border-color: transparent;
  }

  // the mark of the folder: a red cross without one, a green check with it
  .state {
    display: inline-flex;
    align-items: center;
  }

  .is-set {
    color: $ok;
  }

  .is-missing {
    color: $danger-bright;
  }

  // the input is the file picker the button presses: a one pixel, transparent box (a `display: none` one is not
  // allowed to take the files of a directory in every engine)
  .dir-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  // the link of the help: the interactive blue of the palette, the only colour a link may have
  .about {
    color: $interactive;

    &:hover {
      text-decoration: underline;
    }
  }

  .close-help {
    padding: 4px 10px;
    color: $text;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-float;
    }
  }
}
</style>
