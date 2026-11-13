<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { useTemplateRef } from 'vue'
import { paintLevel } from '../modules/level/edit/levelTextures.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import {
  adoptHistoryOf,
  currentMapId,
  currentMapManifest,
  moveCameraToPoseOfOpen,
  rememberCustomMap,
  restorePersistedHistory,
  currentMapSettings,
  zipManifestOf,
  zipSettingsOf,
} from '../modules/level/source/maps.ts'
import { createZipLevelSource } from '../modules/level/source/zipSource.ts'

// the file input is the level's way in: the browser does not let a script choose a file, so the button only presses
// the input, and the input is out of the way because the button is what the user sees
const zipInput = useTemplateRef<HTMLInputElement>('zipInput')

/**
 * Opens the file picker of the level.
 */
function chooseZip(): void {
  zipInput.value?.click()
}

/**
 * Loads the level of the zip the user chose.
 *
 * @remarks
 * The zip is the way a level comes back into the editor from the disk: its three files are found by their extension and
 * the name of their level folder, or by the manifest of the zip (see `modules/level/zipSource.ts`). The level it holds
 * replaces the one on the screen.
 *
 * @param event The change of the file input.
 */
async function loadZip(event: Event): Promise<void> {
  const input = event.target

  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const file = input.files?.item(0)

  // the input keeps its value otherwise, so the same zip could not be opened twice
  input.value = ''

  if (file === null || file === undefined) {
    return
  }

  const data = await file.arrayBuffer()

  // the textures of the zip are painted on the level before the views get it (see `openLevel`'s prepare step)
  const source = createZipLevelSource(file.name, data)

  await levelStore.openLevel(source, async (map): Promise<void> => {
    await paintLevel(map, source.data())
  })

  if (levelStore.status.value !== 'ready') {
    return
  }

  // the new level has its own prompt: the zip joins the list first, so the camera can find the pose the zip was left at
  // (a zip is a value of the session, its pose belongs to the name and the size of the zip)
  currentMapId.value = rememberCustomMap(file.name, data)
  currentMapManifest.value = zipManifestOf(source)
  currentMapSettings.value = zipSettingsOf(source)
  adoptHistoryOf(currentMapId.value, source)

  // the steps the archive carries come back on the level the same way they do on a reload, and then the camera goes
  // where the zip was last left, or to the spawn of its player
  await restorePersistedHistory()
  moveCameraToPoseOfOpen(currentMapId.value)
}
</script>

<template>
  <div class="LevelSelector">
    <button
      class="open-level"
      type="button"
      v-tooltip="'Open a level from a zip'"
      aria-label="Open a level from a zip"
      @click="chooseZip"
    >
      <FolderOpen :size="14" />
      <span class="label">Import from ZIP</span>
    </button>
    <input
      ref="zipInput"
      class="zip-input"
      type="file"
      accept=".zip,application/zip"
      aria-label="A level zip"
      @change="loadZip"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the section of the level: the label of the group and the way in, in the middle of the header, so it reads as the
// level of the document and not as a part of the widget tools on the right
.LevelSelector {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    opacity: 0.65;
  }

  // the way in of a level: the same frame as the buttons of the widget manager, so the two groups read as one tool bar.
  // The button carries its **label** too (2026-11-06), so it grows with it: a fixed width broke the text into three lines
  .open-level {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    padding: 0 8px 0 6px;
    color: $text-icon;
    white-space: nowrap;
    background: transparent;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }

    .label {
      color: $text;
      opacity: 0.85;
    }
  }

  // the input is the file picker the button presses: the browser draws nothing for it, so it is out of the way
  .zip-input {
    display: none;
  }
}
</style>
