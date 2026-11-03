<script setup lang="ts">
import { Download, LoaderCircle } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import { downloadBinaryAs } from '../modules/export/download.ts'
import { exportLevelZip } from '../modules/export/exportLevel.ts'
import { levelStore } from '../modules/level/levelStore.ts'

/**
 * Whether the archive is being built: the packing of a big level takes seconds, and the button says so.
 */
const isPacking = ref(false)

/**
 * Whether there is a level to write.
 */
const hasLevel = computed(() => {
  return levelStore.map.value !== undefined
})

/**
 * Writes the level on the screen as a zip and gives it to the browser.
 *
 * @remarks
 * The archive is built **from the map in the memory** (the polygons of the editor and the loaded scene, lighting and
 * description), so the bytes of the original files are not part of it: a delete of the editor is in the file, and a
 * level opened from a zip or from the data directory comes out the same way.
 *
 * The packing runs on this thread and blocks it for a few seconds on a big level (level 11: the scene is the slow one),
 * so the button follows the steps the export reports: a spinner and the percentage while it runs, a check when the
 * file went to the browser. The spinner is a `transform` animation, which the compositor turns even while the packing
 * holds the thread.
 */
async function download(): Promise<void> {
  const map = levelStore.map.value

  if (map === undefined || isPacking.value) {
    return
  }

  isPacking.value = true

  // the button has to read as busy **before** the packing takes the thread: one frame of it
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

  try {
    const { name, data } = await exportLevelZip(map)

    downloadBinaryAs(name, data, 'application/zip')
  } finally {
    isPacking.value = false
  }
}
</script>

<template>
  <button
    class="DownloadLevel"
    type="button"
    :disabled="!hasLevel || isPacking"
    :aria-label="isPacking ? 'Packing the level…' : 'Download the level as a zip'"
    v-tooltip="isPacking ? 'Packing the level…' : 'Download the level as a zip'"
    @click="download"
  >
    <LoaderCircle v-if="isPacking" class="spinner" :size="14" />
    <Download v-else :size="14" />
    <span class="label">{{ isPacking ? 'Packing…' : 'Download' }}</span>
  </button>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the way out of the level: the same frame as the buttons of the header, with its own label so the way to get the work
// out of the editor is not a guess
.DownloadLevel {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  color: $text-icon;
  font: inherit;
  background: transparent;
  border: 1px solid $border;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-panel;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .label {
    white-space: nowrap;
  }

  // the turning mark of a wait: the packing blocks the thread, so it stands still during it — the disabled state and
  // the words are what say the page is busy
  .spinner {
    animation: DownloadLevel-spin 1.2s linear infinite;
  }
}

@keyframes DownloadLevel-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
