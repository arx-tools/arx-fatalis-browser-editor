<script setup lang="ts">
import { Check, Download, LoaderCircle, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { downloadBinaryAs } from '../modules/export/download.ts'
import { exportLevelZip } from '../modules/export/exportLevel.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'

/**
 * Where the export is.
 */
type ExportState = 'idle' | 'packing' | 'done' | 'failed'

/**
 * How long the mark of the end of an export stays on the button, in milliseconds.
 */
const MARK_LINGER_MS = 2000

/**
 * What the export does now.
 */
const state = ref<ExportState>('idle')

/**
 * How far the packing is, in percent, while it runs.
 */
const percent = ref(0)

let markTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Whether there is a level to write.
 */
const hasLevel = computed(() => {
  return levelStore.map.value !== undefined
})

/**
 * The way to read the button of the current state.
 */
const label = computed(() => {
  if (state.value === 'packing') {
    return `Packing… ${String(percent.value)}%`
  }

  if (state.value === 'done') {
    return 'Downloaded'
  }

  if (state.value === 'failed') {
    return 'Failed'
  }

  return 'Download'
})

/**
 * The tooltip of the button of the current state.
 *
 * @returns The text the tooltip shows.
 */
function titleOf(): string {
  if (state.value === 'packing') {
    return 'Packing the level…'
  }

  if (state.value === 'done') {
    return 'The level is in your downloads'
  }

  if (state.value === 'failed') {
    return 'The level could not be packed'
  }

  return 'Download the level as a zip'
}

/**
 * Shows the mark of the end of an export for a moment.
 *
 * @param mark What the export ended with.
 */
function showMark(mark: 'done' | 'failed'): void {
  state.value = mark

  if (markTimer !== undefined) {
    clearTimeout(markTimer)
  }

  markTimer = setTimeout(() => {
    state.value = 'idle'
    percent.value = 0
    markTimer = undefined
  }, MARK_LINGER_MS)
}

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

  if (map === undefined || state.value === 'packing') {
    return
  }

  state.value = 'packing'
  percent.value = 0

  // the button has to read as busy **before** the packing takes the thread: one frame of it
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

  try {
    const { name, data } = await exportLevelZip(map, (value): void => {
      percent.value = value
    })

    downloadBinaryAs(name, data, 'application/zip')
    showMark('done')
  } catch {
    // the error toast of the editor is a later round: the button says what happened
    showMark('failed')
  }
}

onBeforeUnmount(() => {
  if (markTimer !== undefined) {
    clearTimeout(markTimer)
    markTimer = undefined
  }
})
</script>

<template>
  <button
    class="DownloadLevel"
    type="button"
    :class="`is-${state}`"
    :disabled="!hasLevel || state === 'packing'"
    :aria-label="titleOf()"
    v-tooltip="titleOf()"
    @click="download"
  >
    <LoaderCircle v-if="state === 'packing'" class="spinner" :size="14" />
    <Check v-else-if="state === 'done'" class="mark" :size="14" />
    <X v-else-if="state === 'failed'" class="mark" :size="14" />
    <Download v-else :size="14" />
    <span class="label">{{ label }}</span>
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

  // the turning mark of a wait: the packing blocks the thread, but a `transform` animation is turned by the compositor,
  // so it keeps going while the level is packed
  .spinner {
    animation: DownloadLevel-spin 1.2s linear infinite;
  }

  // the end of an export: a green check for a file that went to the browser, a red cross for one that did not
  &.is-done .mark {
    color: $ok;
  }

  &.is-failed .mark {
    color: $danger-bright;
  }
}

@keyframes DownloadLevel-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
