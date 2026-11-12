<script setup lang="ts">
import { Check, CircleQuestionMark, FolderOpen, TriangleAlert, X } from 'lucide-vue-next'
import { siYoutube } from 'simple-icons'
import { computed, useTemplateRef, watch } from 'vue'
import {
  dataDirKind,
  dataDirPermission,
  dataDirSettled,
  dataDirState,
  hasDataDir,
  isDataDirSetupOpen,
  requestDataDirPermission,
  setDataDirHandle,
  setPickedDataDir,
  type DataDirFile,
} from '../modules/level/source/dataDir.ts'
import { directoryPickerOf, permissionOf, pickDirectory } from '../modules/level/source/dataDirHandle.ts'
import { paintLevel, repaintLevelTextures } from '../modules/level/edit/levelTextures.ts'
import { persistedRef } from '../modules/persistedRef/persistedRef.ts'
import { starterLevelSource } from '../modules/level/source/levelSource.ts'
import { getUrlAdapter } from '../modules/persistedRef/url.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import { isZipLevelSource } from '../modules/level/source/zipSource.ts'
import {
  arxLevels,
  availableMapIdOf,
  currentMapId,
  forgetArxLevels,
  mapNeedingDataDir,
  openMap,
  refreshDataDir,
  requestedMapId,
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
 * Whether the editor asks for the folder again after a reload.
 *
 * @remarks
 * A wish of the user, not the folder: a browser without the directory picker gets the files of a folder as a snapshot
 * of the session, and a reload loses them. The flag is a `persistedRef` in the local storage (the folder itself is
 * never stored), and the dialog opens itself once when an editor starts without a folder.
 */
const askOnReload = persistedRef<boolean>({
  key: 'dataDirAskOnReload',
  defaultValue: false,
  persistInLocalStorage: true,
})

/**
 * The browsers, and whether they can keep the folder the user picks.
 *
 * @remarks
 * The one way a page opens a folder again is the directory picker of the File System Access API; a browser without it
 * can only take the **files of a folder** as a snapshot of the session. The line is shown only for such a browser (the
 * reader is the one who may move the editor to another one), and it is a fact to keep with the source:
 * https://caniuse.com/mdn-api_window_showdirectorypicker
 */
const BROWSERS: ReadonlyArray<{ readonly name: string; readonly keeps: boolean }> = [
  { name: 'Chrome', keeps: true },
  { name: 'Edge', keeps: true },
  { name: 'Opera', keeps: true },
  { name: 'Firefox', keeps: false },
  { name: 'Safari', keeps: false },
]

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
 * Whether the dialog already opened itself in this page.
 *
 * @remarks
 * The question is asked once per start: a dialog that opens again after every press would fight the user.
 */
let hasAskedToReopen = false

/**
 * Opens the dialog when the user asked for it on a previous visit, and the folder is not there.
 *
 * @remarks
 * A browser without the directory picker loses the folder on a reload, and the user asked to be remembered of it: the
 * dialog comes up once, so the folder can be given again (a folder picked with the picker, or a folder of the url, is
 * not asked for).
 */
watch(
  [dataDirSettled, dataDirKind],
  () => {
    if (hasAskedToReopen || !dataDirSettled.value || !askOnReload.value) {
      return
    }

    hasAskedToReopen = true

    if (!hasDataDir()) {
      isDataDirSetupOpen.value = true
    }
  },
  { immediate: true },
)

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
 * The browser blocks a folder whose access the user denied, or asks for the access again: the two are what the user has
 * to know, in the line of the folder. The snapshot of a picked folder is not a note of the panel: the warning of the
 * dialog says it, and once per dialog is enough (2026-11-12, the owner).
 */
const stateNote = computed(() => {
  if (isBlocked.value) {
    return 'access blocked by browser settings'
  }

  if (needsPermission.value) {
    return 'the browser asks for the access again'
  }

  return undefined
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
 * Opens the setup dialog.
 */
function openSetup(): void {
  isDataDirSetupOpen.value = true
}

/**
 * Closes the setup dialog.
 */
function closeSetup(): void {
  isDataDirSetupOpen.value = false
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

  // the map of the link first: the editor was asked for it, and the address bar may have moved on (a picked folder, a
  // second visit); the address bar is the fallback of a link that did not reach the notice (a folder given later, by
  // hand, on a page that had none at the start)
  const requested = requestedMapId.value ?? mapIdFromUrl(getUrlAdapter(undefined))
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
 * Opens the map of the link when the folder of the game arrives.
 *
 * @remarks
 * The folder can arrive through any of the ways of the dialog, and through a permission the browser asks for again; a
 * level of the game is in the list only when the folder is there, so a list that gains the map of the link is the
 * moment to open it (and the notice of the view goes with it, because a map opened is a map found).
 */
watch(
  arxLevels,
  () => {
    const wanted = requestedMapId.value

    if (wanted === undefined) {
      return
    }

    if (availableMapIdOf(wanted, arxLevels.value) === undefined) {
      // the folder has levels now and this map is not one of them: the notice of the view is not about the folder any
      // more, and a levelless folder keeps it (the folder is not the right one)
      if (arxLevels.value.length > 0) {
        mapNeedingDataDir.value = undefined
        requestedMapId.value = undefined
      }

      return
    }

    openMap(wanted, { camera: 'keep' }).catch(() => {
      // the store keeps the error of the load, the walkable view shows it
    })
  },
  { flush: 'post' },
)

/**
 * Closes the dialog a moment after the folder was given.
 *
 * @remarks
 * The state of the dialog is the answer to the press: the author sees the check and the name of the folder, and then the
 * dialog goes out of the way, because the next thing they want is the level (2026-11-12, the owner). A dialog that is
 * opened by hand is never closed by itself: this runs only on the press that gives a folder.
 */
function closeWhenTheFolderIsSeen(): void {
  setTimeout(() => {
    isDataDirSetupOpen.value = false
  }, 1000)
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
  closeWhenTheFolderIsSeen()
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
  closeWhenTheFolderIsSeen()
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

    <Modal v-if="isDataDirSetupOpen" title="Setting up Arx data dir" wide @close="closeSetup">
      <!-- the two links of the subject, in the title: where the folder is (the wiki) and how the assets of the game go
           into it (a video). The text of the dialog says one thing then, instead of repeating the links under it -->
      <template #title-actions>
        <a
          class="title-link"
          href="https://wiki.arx-libertatis.org/Data_directories"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Read more about data directories on the Arx Libertatis wiki"
          v-tooltip="'Read more about data directories on the Arx Libertatis wiki'"
        >
          <CircleQuestionMark :size="15" />
        </a>
        <a
          class="title-link"
          href="https://youtu.be/gwcLJ90KExA?t=449&amp;si=MP8flW7bMHAHaWrS"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Info on where your data dir is and how to extract the assets of the game into it using Arx Libertatis on Windows"
          v-tooltip="
            'Info on where your data dir is and how to extract the assets of the game into it using Arx Libertatis on Windows'
          "
        >
          <svg :width="15" :height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path :d="siYoutube.path" />
          </svg>
        </a>
      </template>

      <!-- what the folder is for, in one line: the reader hands over a folder of their disk, so the dialog says at once
           that nothing leaves the tab (it is the trust of the dialog, not a detail) -->
      <p class="lead">
        The levels and the assets of the game are read from this folder, and <strong>nothing is uploaded</strong>.
      </p>

      <!-- the state of the folder is the point of the dialog: it is the first thing on it, in the middle, with air
           around it, so a reader sees at once whether the editor has the files of the game -->
      <div class="state-panel" :class="stateClass">
        <Check v-if="hasFolder" class="state-icon" :size="28" />
        <TriangleAlert v-else class="state-icon" :size="28" />
        <span class="state-title">
          <template v-if="hasFolder">The <strong>Arx data dir</strong> is set to the following folder</template>
          <template v-else>{{ stateLabel }}</template>
        </span>
        <span v-if="folderName !== undefined" class="state-name" :title="folderName">{{ folderName }}</span>
        <span v-if="stateNote !== undefined" class="state-note">({{ stateNote }})</span>
        <button v-if="needsPermission" class="reconnect" type="button" @click="reconnectDir">
          Reconnect the folder
        </button>
      </div>

      <button class="browse" type="button" @click="chooseDir">
        <FolderOpen :size="16" />
        <span class="browse-label">Select Arx data dir</span>
      </button>

      <!-- what the folder of this browser can do: one warning where the folder can not be kept, the browsers that can,
           and the box that asks for the folder again. As little text as the reader needs, in the order they read it -->
      <section v-if="!hasPicker" class="data-dir-info">
        <p class="warning">
          <TriangleAlert :size="14" />
          <span
            >The selected data dir will not be remembered in this browser, as it lacks support for
            <a
              class="warning-link"
              href="https://caniuse.com/mdn-api_window_showdirectorypicker"
              target="_blank"
              rel="noopener noreferrer"
              >this feature</a
            >.</span
          >
        </p>
        <div class="support-row">
          <span class="support-title">Supported browsers:</span>
          <ul class="support-list">
            <li v-for="browser in BROWSERS" :key="browser.name" :class="browser.keeps ? 'is-ok' : 'is-missing'">
              <component :is="browser.keeps ? Check : X" :size="12" />
              <span>{{ browser.name }}</span>
            </li>
          </ul>
        </div>
        <label class="ask-again">
          <input v-model="askOnReload" type="checkbox" />
          <span>Reopen this dialog automatically after a page reload.</span>
        </label>
      </section>
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

// the one line of the dialog that says what the folder is for, in the grey of a caption (the links of the subject live in
// the title, this line carries only the promise that nothing is uploaded)
.lead {
  margin: 0;
  color: $text-subtle;
  font-size: calc(0.9em + 2px);
  line-height: 1.4;

  strong {
    color: $text-muted;
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
}

// the info block under the button of the folder: the warning of a browser that can not keep the folder, the browsers
// that can, and the box of the question. The block is the quiet part of the dialog, so it keeps the grey of the caption
// and the small letters, and one gap between its lines
.data-dir-info {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid $border-dark;
  font-size: calc(0.82em + 2px);
  line-height: 1.45;
}

// the warning of the browser: the amber of the palette, a tint of it for the plate, and the icon of a warning
.warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 7px 10px;
  color: $accent;
  background: rgba($accent, 0.1);
  border: 1px solid rgba($accent, 0.3);
  border-radius: 4px;

  svg {
    flex: none;
  }

  // the link of the detail keeps the colour of the warning, and only the underline says it is a link
  .warning-link {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: $interactive;
    }
  }
}

// the line of the browsers: the name of the list and the browsers follow each other, in one line
.support-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0 0 20px;
}

// the label of the list
.support-title {
  color: $text-muted;
}

.support-list {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  // the mark of the browser: the ok colour of the palette for the one that keeps the folder, the danger for the other
  .is-ok {
    color: $ok;
  }

  .is-missing {
    color: $danger-muted;
  }
}

.ask-again {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: $text-muted;
  cursor: pointer;

  input {
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
  }
}

// the link of the title: an icon of the subject (the wiki, the video), in the colour of the title and the interactive
// blue under the pointer
.title-link {
  display: inline-flex;
  color: $text-muted;

  &:hover {
    color: $interactive;
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
