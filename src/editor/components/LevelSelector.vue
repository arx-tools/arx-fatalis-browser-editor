<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { nextTick, useTemplateRef } from 'vue'
import { levelStore } from '../modules/level/levelStore.ts'
import { createZipLevelSource } from '../modules/level/zipSource.ts'
import { cameraStore } from './widgets/cameraStore.ts'

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

  const file = input.files?.[0]

  // the input keeps its value otherwise, so the same zip could not be opened twice
  input.value = ''

  if (file === undefined) {
    return
  }

  const data = await file.arrayBuffer()

  await levelStore.openLevel(createZipLevelSource(file.name, data))

  // the new level has its own player: the camera goes there, so the view opens on something instead of the place the
  // previous level left it at. The tick lets the walkable view rebuild itself around the new map first
  if (levelStore.status.value === 'ready') {
    await nextTick()
    cameraStore.moveToSpawn()
  }
}
</script>

<template>
  <div class="LevelSelector">
    <span class="label">Levels</span>
    <button
      class="open-level"
      type="button"
      v-tooltip="'Open a level from a zip'"
      aria-label="Open a level from a zip"
      @click="chooseZip"
    >
      <FolderOpen :size="14" />
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

  // the way in of a level: the same frame as the buttons of the widget manager, so the two groups read as one tool bar
  .open-level {
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

  // the input is the file picker the button presses: the browser draws nothing for it, so it is out of the way
  .zip-input {
    display: none;
  }
}
</style>
