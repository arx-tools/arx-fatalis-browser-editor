<script setup lang="ts">
import { FolderOpen } from 'lucide-vue-next'
import { useTemplateRef } from 'vue'
import { setPickedDataDir, type DataDirFile } from '../modules/level/dataDir.ts'
import { paintLevel, repaintLevelTextures } from '../modules/level/levelTextures.ts'
import { starterLevelSource } from '../modules/level/levelSource.ts'
import { levelStore } from '../modules/level/levelStore.ts'

// the input is the way to the disk: the browser does not let a script pick a folder, only the user can, so the button
// presses the input and the input stays out of the way
const dirInput = useTemplateRef<HTMLInputElement>('dirInput')

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
 * or loaded, when it could not be without one.
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
  console.info(`Data dir: ${name}, ${String(files.length)} files.`)

  if (levelStore.map.value === undefined) {
    // the level could not load without the folder: now it can
    await levelStore.openLevel(starterLevelSource(), async (map): Promise<void> => {
      await paintLevel(map)
    })

    return
  }

  await repaintLevelTextures()
}
</script>

<template>
  <div class="DataDirPicker">
    <span class="label">Arx Data Dir</span>
    <button
      class="open-data-dir"
      type="button"
      v-tooltip="'Pick the data directory of the game'"
      aria-label="Pick the data directory of the game"
      @click="chooseDir"
    >
      <FolderOpen :size="14" />
    </button>
    <input
      ref="dirInput"
      class="dir-input"
      type="file"
      webkitdirectory
      aria-label="The data directory of the game"
      @change="loadDir"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the second way in, beside the level: the data directory of the game, which the textures (and later the models and
// the scripts) are read from. It reads as a part of the level section, so the two sit in one row
.DataDirPicker {
  display: flex;
  align-items: center;
  gap: 6px;

  .label {
    opacity: 0.65;
  }

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
</style>
