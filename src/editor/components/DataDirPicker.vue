<script setup lang="ts">
import { Check, FolderOpen, TriangleAlert } from 'lucide-vue-next'
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
  openMap,
  refreshDataDir,
  startupSource,
} from '../modules/level/source/maps.ts'
import { mapIdFromUrl } from '../modules/level/source/maps/mapId.ts'
import Modal from './Modal.vue'

/**
 * The data directory of the game: the folder the level files and the textures are read from.
 *
 * @remarks
 * One button in the middle bar (2026-11-06, the owner's request): the **state** of the folder as its icon — a green
 * check when the editor has one, a warning triangle when it has not — and the label. The button opens the **setup
 * dialog**, which says what the folder is and where the state is, and holds the folder picker: a picked folder is read
 * on the page (the browser gives the files of it, nothing is uploaded), and the editor paints the level again with the
 * textures of the folder — or loads it, when it could not be without one.
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
 * Whether the setup dialog of the folder is open.
 */
const isSettingUp = ref(false)

/**
 * The class of the state: the green check or the warning triangle of it.
 */
const stateClass = computed(() => {
  let name = 'is-missing'

  if (hasFolder.value) {
    name = 'is-set'
  }

  return name
})

/**
 * What the icon says, for a reader that can not see it.
 */
const stateLabel = computed(() => {
  let label = 'No Arx data dir yet'

  if (hasFolder.value) {
    label = 'The Arx data dir is set'
  }

  return label
})

/**
 * The name of the folder the editor reads, or `undefined` when it has none.
 *
 * @remarks
 * The value is the **name** of the picked folder (or the path of the url), which can be long: the dialog shows it in one
 * line with an ellipsis, and the whole value is in the `title` of the line. Without a folder the panel is only the icon
 * and the sentence: the line that says what the folder is stands above the panel.
 */
const folderName = computed(() => {
  const name = dataDirState.value

  if (name === undefined || name.length === 0) {
    return undefined
  }

  return name
})

/**
 * What the button says in a tooltip: the state of the folder and what pressing it does.
 */
const buttonTooltip = computed(() => {
  let text = 'Set up the Arx data dir'

  if (hasFolder.value) {
    text = `The Arx data dir is set (${dataDirState.value ?? ''}). Press to change it`
  }

  return text
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
    <button
      class="setup"
      type="button"
      :class="stateClass"
      v-tooltip="buttonTooltip"
      :aria-label="`${stateLabel}. Set up the Arx data dir`"
      @click="isSettingUp = true"
    >
      <Check v-if="hasFolder" :size="13" />
      <TriangleAlert v-else :size="13" />
      <span class="name">Arx data dir</span>
    </button>

    <input
      ref="dirInput"
      class="dir-input"
      type="file"
      webkitdirectory
      aria-label="The data directory of the game"
      @change="loadDir"
    />

    <Modal v-if="isSettingUp" title="Setting up Arx data dir" @close="isSettingUp = false">
      <!-- what the folder is, and where the wiki says more: the two quiet lines of the dialog, under its title and above
           the state (2026-11-06, the owner's request) -->
      <div class="intro">
        <p>
          The levels and the textures of the game are read from this folder, and <strong>nothing is uploaded</strong>.
        </p>
        <p class="read-more">
          Read more about data directories
          <a
            class="wiki-link"
            href="https://wiki.arx-libertatis.org/Data_directories"
            target="_blank"
            rel="noopener noreferrer"
            >on the Arx Libertatis wiki</a
          >.
        </p>
      </div>

      <!-- the state of the folder is the point of the dialog: it is the first thing on it, in the middle, with air
           around it, so a reader sees at once whether the editor has the files of the game -->
      <div class="state-panel" :class="stateClass">
        <Check v-if="hasFolder" class="state-icon" :size="28" />
        <TriangleAlert v-else class="state-icon" :size="28" />
        <span class="state-title">{{ stateLabel }}</span>
        <span v-if="folderName !== undefined" class="state-name" :title="folderName">{{ folderName }}</span>
      </div>

      <button class="browse" type="button" @click="chooseDir">
        <FolderOpen :size="16" />
        Browse Arx data dir
      </button>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the way in of the game's own files, as one button of the middle bar: the state as its icon, and the label. The dialog
// it opens is the setup, with the folder picker inside it (2026-11-06, the owner's request).
.DataDirPicker {
  display: inline-flex;
  align-items: center;

  .setup {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 7px 0 5px;
    color: $text;
    font: inherit;
    white-space: nowrap;
    background: transparent;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }

    // the state of the folder: the green check when it is there, the amber triangle when it is not
    &.is-set svg {
      color: $ok;
    }

    &.is-missing svg {
      color: $accent;
    }
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
}

// the dialog of the setup: `Modal.vue` teleports its content to the body, so these elements are **not** under
// `.DataDirPicker` — a nested selector would not reach them, and the styles live at the top level of the block

// what the folder is, and where the wiki says more: the two quiet lines under the title, in the grey of the caption
.intro {
  margin: 0 0 10px;
  color: $text-subtle;
  font-size: 0.9em;

  p {
    margin: 0;
  }

  p + p {
    margin-top: 2px;
  }
}

// the state of the folder in the dialog: the icon, the sentence and the name, in the middle, with air around them
.state-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 12px 0 16px;
  padding: 22px 16px;
  text-align: center;
  background: $surface-panel;
  border: 1px solid $border-dark;
  border-radius: 6px;

  .state-icon {
    margin-bottom: 2px;
  }

  &.is-set .state-icon {
    color: $ok;
  }

  &.is-missing .state-icon {
    color: $accent;
  }

  .state-title {
    color: $text-strong;
    font-size: 1.05em;
  }

  // the name of the folder can be a whole path: one line with an ellipsis, and the whole value in the title
  .state-name {
    max-width: 100%;
    overflow: hidden;
    color: $text-subtle;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// the way in: the one big button of the dialog
.browse {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  color: $text-strong;
  font: inherit;
  font-size: 1em;
  background: $surface-raised;
  border: 1px solid $border-strong;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    background: $surface-float;
    border-color: $interactive;
  }
}

// the link of the help: the interactive blue of the palette, the only colour a link may have
.wiki-link {
  color: $interactive;

  &:hover {
    text-decoration: underline;
  }
}
</style>
