<script setup lang="ts">
import { Check, FolderOpen, TriangleAlert } from 'lucide-vue-next'
import { computed, ref, useTemplateRef } from 'vue'
import {
  dataDirKind,
  dataDirPermission,
  dataDirState,
  forgetDataDir,
  requestDataDirPermission,
  setDataDirHandle,
  setDataDirPath,
  setPickedDataDir,
  storedDataDir,
  type DataDirFile,
} from '../modules/level/source/dataDir.ts'
import { directoryPickerOf, permissionOf, pickDirectory } from '../modules/level/source/dataDirHandle.ts'
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
 * One button in the middle bar (2026-11-06, the owner's request): the **state** of the folder as its icon, a green check
 * when the editor can read it and a warning triangle when it can not, and the label. The button opens the **setup
 * dialog**, which says what the folder is and where the state is, and holds the ways to give it. The **directory picker
 * of the browser** (`showDirectoryPicker`) keeps its handle in the IndexedDB when the browser has it, so a reload finds
 * the folder again (Chromium). The **files of a folder** (`webkitdirectory`) are a snapshot for the session only, and
 * that is what a browser without the picker (Firefox) can give. A **full path of the disk**, typed or pasted in the
 * dialog, is served by the development server and remembered by the browser.
 */
const dirInput = useTemplateRef<HTMLInputElement>('dirInput')

/**
 * The browser has the directory picker of the File System Access API (Chromium), so a folder can be remembered.
 */
const hasPicker = directoryPickerOf() !== undefined

/**
 * Whether the editor can read a data directory right now.
 *
 * @remarks
 * It follows the state of the module, which changes after the app started the folder: a value read once would say "no
 * folder" on the first visit with a url that names one.
 */
const hasFolder = computed(() => {
  if (dataDirKind.value === 'picked' || dataDirKind.value === 'path') {
    return true
  }

  return dataDirKind.value === 'handle' && dataDirPermission.value === 'granted'
})

/**
 * Whether the browser blocks the remembered folder (the user denied the access for the site).
 */
const isBlocked = computed(() => {
  return dataDirKind.value === 'handle' && dataDirPermission.value === 'denied'
})

/**
 * Whether the remembered folder is there, but the browser asks for the access again (a press is enough).
 */
const needsPermission = computed(() => {
  return dataDirKind.value === 'handle' && dataDirPermission.value === 'prompt'
})

/**
 * Whether the setup dialog of the folder is open.
 */
const isSettingUp = ref(false)

/**
 * The path the dialog's input holds, before (or after) the user sets it.
 */
const pathInput = ref('')

/**
 * The class of the state: the green check, the warning triangle, or the blocked folder.
 */
const stateClass = computed(() => {
  if (hasFolder.value) {
    return 'is-set'
  }

  if (isBlocked.value) {
    return 'is-blocked'
  }

  return 'is-missing'
})

/**
 * What the icon says, for a reader that can not see it.
 */
const stateLabel = computed(() => {
  if (hasFolder.value) {
    return 'The Arx data dir is set'
  }

  if (isBlocked.value) {
    return 'The Arx data dir is blocked'
  }

  if (needsPermission.value) {
    return 'The Arx data dir needs access'
  }

  return 'No Arx data dir yet'
})

/**
 * The folder the editor reads, or `undefined` when it has none.
 *
 * @remarks
 * The value is the **path** of the folder of the url or of the storage, or the **name** of the folder the browser gave
 * (it does not give the absolute path out). It can be long: the dialog shows it in one line with an ellipsis, and the
 * whole value is in the `title` of the line.
 */
const folderName = computed(() => {
  const name = dataDirState.value

  if (name === undefined || name.length === 0) {
    return undefined
  }

  return name
})

/**
 * What the state line says about the folder, after its name.
 *
 * @remarks
 * The files of a picked folder are a snapshot, and the browser blocks a folder whose access the user denied: the two
 * are what the user has to know, in the line of the folder.
 */
const stateNote = computed(() => {
  if (dataDirKind.value === 'picked') {
    return 'temporary, will get forgotten on next page load'
  }

  if (isBlocked.value) {
    return 'access blocked by browser settings'
  }

  if (needsPermission.value) {
    return 'the browser asks for the access again'
  }

  return undefined
})

/**
 * The line under the name of the browse button: the two shapes of the folder, and that only one of them is remembered.
 */
const browseNote = computed(() => {
  if (hasPicker) {
    return 'remembered by the browser'
  }

  return 'temporary, will get forgotten on next page load'
})

/**
 * Whether the dialog has something to forget: the path in the input, or a folder of the session.
 */
const canForget = computed(() => {
  return pathInput.value.trim() !== '' || dataDirState.value !== undefined
})

/**
 * What the button says in a tooltip: the state of the folder and what pressing it does.
 */
const buttonTooltip = computed(() => {
  let text = 'Set up the Arx data dir'

  if (folderName.value !== undefined) {
    let note = ''

    if (stateNote.value !== undefined) {
      note = ` (${stateNote.value})`
    }

    text = `${stateLabel.value} (${folderName.value}${note}). Press to change it`
  }

  return text
})

/**
 * Opens the setup dialog, with the path of the session in its input.
 */
function openSetup(): void {
  let path = storedDataDir()

  if (dataDirKind.value === 'path') {
    path = dataDirState.value
  }

  pathInput.value = path ?? ''
  isSettingUp.value = true
}

/**
 * Follows a data directory that changed: the level on the screen, the list of the maps and the textures.
 *
 * @remarks
 * The level is painted again with the textures of the folder — or loaded, when it could not be without one — and the
 * list of the header looks for the levels of the folder. The map of the url waited for the folder: the address bar kept
 * it while the list did not have its level, so the level that was asked for opens now instead of the one the editor
 * started with.
 */
async function afterDataDirChanged(): Promise<void> {
  forgetArxLevels()

  // the list of the maps follows the folder: the levels it has are what it can open
  await refreshDataDir()

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

/**
 * Opens the folder picker, or the input of a folder when the browser has no picker.
 */
async function chooseDir(): Promise<void> {
  if (!hasPicker) {
    dirInput.value?.click()

    return
  }

  const handle = await pickDirectory()

  if (handle === undefined) {
    return
  }

  await setDataDirHandle(handle, await permissionOf(handle))
  await afterDataDirChanged()
}

/**
 * Reads the folder the user picked as the data directory of the game.
 *
 * @remarks
 * The files come with the page: a `webkitdirectory` input gives the whole tree, and the editor reads what it needs from
 * it (`dataDir.ts` keeps the index by path). The folder is a snapshot of the session: the browser can not open it again
 * after a reload, and the dialog says so.
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

  await setPickedDataDir(files, name)
  console.info(`Data dir: ${name}, ${String(files.length)} files (temporary).`)
  await afterDataDirChanged()
}

/**
 * Sets the data directory to the path the input holds.
 */
async function applyPath(): Promise<void> {
  const applied = await setDataDirPath(pathInput.value)

  if (!applied) {
    return
  }

  console.info(`Data dir: ${pathInput.value.trim()}`)
  await afterDataDirChanged()
}

/**
 * Forgets the data directory: the path of the storage, the folder of the picker, and the files of the session.
 */
async function forgetDir(): Promise<void> {
  await forgetDataDir()
  pathInput.value = ''
  console.info('Data dir: forgotten.')
  await afterDataDirChanged()
}

/**
 * Asks the browser for the access to the remembered folder, from the press of the button that says it needs it.
 */
async function reconnectDir(): Promise<void> {
  const permission = await requestDataDirPermission()

  if (permission !== 'granted') {
    return
  }

  await afterDataDirChanged()
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
      @click="openSetup"
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

    <Modal v-if="isSettingUp" title="Setting up Arx data dir" wide @close="isSettingUp = false">
      <!-- what the folder is, and where the wiki says more: the two quiet lines of the dialog, under its title and above
           the state (2026-11-06, the owner's request) -->
      <div class="intro">
        <p>
          The levels and the textures of the game are read from this folder, and <strong>nothing is uploaded</strong>.
        </p>
        <p class="read-more">
          Read more about data directories on the
          <a
            class="text-link"
            href="https://wiki.arx-libertatis.org/Data_directories"
            target="_blank"
            rel="noopener noreferrer"
            >Arx Libertatis wiki</a
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
        <span v-if="stateNote !== undefined" class="state-note">({{ stateNote }})</span>
        <button v-if="needsPermission" class="reconnect" type="button" @click="reconnectDir">
          Reconnect the folder
        </button>
      </div>

      <button class="browse" type="button" @click="chooseDir">
        <FolderOpen :size="16" />
        <span class="browse-label">Browse Arx data dir</span>
        <small class="browse-note">({{ browseNote }})</small>
      </button>

      <p class="or-path">Or you can specify the full path to your data dir in the input below:</p>

      <div class="path-row">
        <input
          v-model="pathInput"
          class="path-input"
          type="text"
          aria-label="The full path of the data dir"
          placeholder="e.g. C:\Users\<Username>\Saved Games\Arx Libertatis\unpacked"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="applyPath"
        />
        <button class="apply" type="button" @click="applyPath">Set data dir</button>
        <button class="forget" type="button" :disabled="!canForget" @click="forgetDir">Forget data dir</button>
      </div>

      <p class="video">
        Info on where your data dir is and how to extract the assets of the game into it using Arx Libertatis on Windows
        can be seen
        <a
          class="text-link"
          href="https://youtu.be/gwcLJ90KExA?t=449&amp;si=MP8flW7bMHAHaWrS"
          target="_blank"
          rel="noopener noreferrer"
          >in this video</a
        >.
      </p>
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

    &.is-blocked svg {
      color: $danger-bright;
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

  &.is-blocked .state-icon {
    color: $danger-bright;
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

  // the word about the folder (the temporary files, the blocked access) on its own line, in the italic of a note
  .state-note {
    color: $text-subtle;
    font-style: italic;
  }

  &.is-blocked .state-note {
    color: $danger-bright;
  }

  // the folder is remembered, but the browser wants the access again: one press, not a new folder
  .reconnect {
    margin-top: 6px;
    padding: 4px 12px;
    color: $text-strong;
    font: inherit;
    font-size: 0.9em;
    background: $surface-raised;
    border: 1px solid $interactive;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-float;
    }
  }
}

// the way in: the one big button of the dialog, with the note of the shape on the line under its label
.browse {
  display: flex;
  flex-wrap: wrap;
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

  // the note of the shape: the smaller, quieter text of the same line
  .browse-note {
    flex-basis: 100%;
    color: inherit;
    font-size: 0.82em;
    font-style: italic;
    text-align: center;
  }
}

// the other way in: a path typed in, under the button
.or-path {
  margin: 14px 0 6px;
  color: $text-subtle;
  font-size: 0.9em;
}

// the line under the form: where the folder is, and how the assets of the game go into it
.video {
  margin: 12px 0 0;
  color: $text-subtle;
  font-size: 0.82em;
  line-height: 1.45;
}

// the input and the two buttons of it, on one line across the dialog
.path-row {
  display: flex;
  gap: 6px;

  .path-input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 7px 9px;
    color: $text;
    font: inherit;
    font-size: 0.92em;
    background: $surface-panel;
    border: 1px solid $border-dark;
    border-radius: 4px;

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }
  }

  .apply,
  .forget {
    flex: 0 0 auto;
    padding: 7px 12px;
    font: inherit;
    font-size: 0.92em;
    white-space: nowrap;
    border-radius: 4px;
    cursor: pointer;
  }

  .apply {
    color: $text-strong;
    background: $surface-raised;
    border: 1px solid $border-strong;

    &:hover {
      background: $surface-float;
      border-color: $interactive;
    }
  }

  .forget {
    color: $text-on-danger;
    background: $danger-deep;
    border: 1px solid $danger;

    &:hover:not(:disabled) {
      background: $danger;
    }

    &:disabled {
      opacity: 0.45;
      cursor: default;
    }
  }
}

// a link of the dialog (the wiki, the video): the interactive blue of the palette, the only colour a link may have. The
// words of it stay on one line: a link split between two lines is read as two sentences
.text-link {
  color: $interactive;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}
</style>
