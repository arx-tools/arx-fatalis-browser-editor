<script setup lang="ts">
import { Check, Download, LoaderCircle, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { downloadBinaryAs } from '../modules/export/download.ts'
import { exportLevelZip } from '../modules/export/exportLevel.ts'
import { exportSeedOf, levelIndexOf } from '../modules/export/exportOptions.ts'
import { snapshotOfHistory } from '../modules/level/edit/editing.ts'
import { levelSeed } from '../modules/level/seed.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import { currentMapId, currentMapManifest, poseOfMap } from '../modules/level/source/maps.ts'
import Modal from './Modal.vue'

/**
 * Where the export is.
 */
type ExportState = 'idle' | 'packing' | 'done' | 'failed'

/**
 * How long the mark of the end of an export stays on the button, in milliseconds.
 */
const MARK_LINGER_MS = 2000

/**
 * The way out of the level: a dialog with the two values a mod is known by, and the export itself.
 *
 * @remarks
 * The button opens the **export dialog** (2026-11-06, the owner's request): the seed the level was made with (the one
 * the url carries) and the index the level takes in the data directory are the last look at the level before the
 * archive is written. The packing runs **in the dialog** — the spinner, the percentage and the bar are here, not in the
 * header — and the archive is built from the map in the memory (see `exportLevel.ts`), so a delete of the editor is in
 * the file and a level opened from a zip or from the data directory comes out the same way.
 */
const isOpen = ref(false)

/**
 * What the export does now.
 */
const state = ref<ExportState>('idle')

/**
 * How far the packing is, in percent, while it runs.
 */
const percent = ref(0)

/**
 * The reason of a failed export, when one failed.
 */
const failure = ref('')

/**
 * The seed of the field: the one of the url when the dialog opens, and whatever the user writes then.
 *
 * @remarks
 * The field writes a **string** (it is a text input), and the value of the url is read as text too: the seed is a number
 * for the generator, and text in the archive and in the address bar.
 */
const seed = ref<string>(levelSeed.value ?? '')

/**
 * The level index of the field: the one the level was opened with, and whatever the user writes then.
 *
 * @remarks
 * `v-model` on a `<input type="number">` writes a **number** when the field parses as one, and an empty string when it
 * is empty: the type says so, and the export reads it as text (`levelIndexOf`).
 */
const levelIndex = ref<string | number>('')

let markTimer: ReturnType<typeof setTimeout> | undefined

/**
 * The level on the screen.
 */
const map = computed(() => {
  return levelStore.map.value
})

/**
 * Whether there is a level to write.
 */
const hasLevel = computed(() => {
  return map.value !== undefined
})

/**
 * The text of the export button of the current state.
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

  return 'Export as ZIP'
})

/**
 * What the button of the header says in a tooltip.
 *
 * @returns The text the tooltip shows.
 */
function titleOf(): string {
  if (state.value === 'packing') {
    return 'The level is packed into a zip, the progress is in the dialog'
  }

  return 'Export the level as a zip'
}

/**
 * Opens the dialog on the level of the screen, with the values of the url.
 *
 * @remarks
 * The fields are filled on **every open**, so the dialog says what the level is now: a level that was opened again
 * brings its own index, and the seed of the url is the one the level was made with. A packing that runs is not reset by
 * opening the dialog again: the percentage it shows is the one of the step it is on.
 */
function open(): void {
  const current = map.value

  if (current === undefined) {
    return
  }

  seed.value = levelSeed.value ?? ''
  levelIndex.value = String(current.dlf.header.levelIdx)

  if (state.value !== 'packing') {
    state.value = 'idle'
    percent.value = 0
    failure.value = ''
  }

  isOpen.value = true
}

/**
 * Closes the dialog: a packing that still runs finishes on its own, and the file goes to the browser.
 */
function close(): void {
  isOpen.value = false
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
 * Writes the level as a zip, with the values of the dialog, and gives it to the browser.
 *
 * @remarks
 * The packing runs on this thread and blocks it for a few seconds on a big level (level 11: the scene is the slow one),
 * so the dialog follows the steps the export reports: a spinner, the percentage and the bar while it runs, a check when
 * the file went to the browser. The spinner is a `transform` animation, which the compositor turns even while the
 * packing holds the thread.
 */
async function exportIt(): Promise<void> {
  const current = map.value

  if (current === undefined || state.value === 'packing') {
    return
  }

  state.value = 'packing'
  percent.value = 0
  failure.value = ''

  // the button has to read as busy **before** the packing takes the thread: one frame of it
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

  try {
    const { name, data } = await exportLevelZip(
      current,
      (value): void => {
        percent.value = value
      },
      {
        levelIndex: levelIndexOf(String(levelIndex.value)),
        // an empty field means the seed the level already has (the number the game's generator made for it)
        seed: exportSeedOf(seed.value) ?? current.settings.seed,
        // the base the zip came with (the name of the mod, its version, its author), which the archive keeps, and the
        // pose of the camera on the level, which a zip opens on
        manifest: currentMapManifest.value,
        camera: poseOfMap(currentMapId.value),
        // the steps of the level: an archive with them is a save of the level, not only its result
        history: snapshotOfHistory(),
      },
    )

    downloadBinaryAs(name, data, 'application/zip')
    showMark('done')
  } catch (error) {
    // the error the export throws is the reason the file is not there (a level without a polygon), and the dialog has
    // the room to say it: a toast of the editor is a later round
    let message = String(error)

    if (error instanceof Error) {
      message = error.message
    }

    failure.value = message
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
  <div class="ExportMap">
    <button
      class="open"
      type="button"
      :disabled="!hasLevel"
      :aria-label="titleOf()"
      v-tooltip="titleOf()"
      @click="open"
    >
      <Download :size="14" />
      <span class="label">Export Map</span>
    </button>

    <Modal v-if="isOpen" title="Export Map" @close="close">
      <div class="field">
        <label for="export-seed">Seed</label>
        <input id="export-seed" v-model="seed" type="text" autocomplete="off" />
        <p class="helper">
          Used by the random number generator. Use any text as a seed, otherwise a number between 100.000.000 and
          999.999.999 is automatically assigned.
        </p>
      </div>

      <div class="field">
        <label for="export-level-index">Level index</label>
        <input id="export-level-index" v-model="levelIndex" type="number" min="0" step="1" inputmode="numeric" />
        <p class="helper">Set to 1 to make Arx Fatalis load the map upon starting a new quest.</p>
      </div>

      <!-- the bar is always in the dialog, hidden while nothing runs: a removed element would make the dialog jump -->
      <div class="progress" :class="{ 'is-hidden': state !== 'packing' }">
        <div class="bar" :style="{ width: `${percent}%` }"></div>
      </div>

      <p v-if="failure !== ''" class="failure">{{ failure }}</p>

      <template #actions>
        <button class="export" type="button" :class="`is-${state}`" :disabled="state === 'packing'" @click="exportIt">
          <LoaderCircle v-if="state === 'packing'" class="spinner" :size="14" />
          <Check v-else-if="state === 'done'" class="mark" :size="14" />
          <X v-else-if="state === 'failed'" class="mark" :size="14" />
          <Download v-else :size="14" />
          <span>{{ label }}</span>
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the way out of the level: the same frame as the buttons of the header, with its own label so the way to get the work
// out of the editor is not a guess. The dialog is the export itself, see the script.
.ExportMap {
  display: inline-flex;
  align-items: center;

  .open {
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
  }
}

// the dialog of the export: `Modal.vue` teleports its content to the body, so these elements are **not** under
// `.ExportMap` — the styles of the dialog are at the top level of the block, where a nested selector would not reach it

// one value of the dialog: the label above the field, the helper lines under it
.field {
  margin-bottom: 14px;

  label {
    display: block;
    margin-bottom: 3px;
    color: $text;
  }

  input {
    box-sizing: border-box;
    width: 100%;
    padding: 4px 6px;
    color: $text-strong;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;

    &:focus {
      border-color: $interactive;
      outline: none;
    }
  }

  // the line under the field: what the value means, in the grey of a caption (the material ui helper text)
  .helper {
    margin: 3px 0 0;
    color: $text-subtle;
    font-size: 0.9em;
  }
}

// the percentage of the packing, in the dialog and not in the header: a thin bar that the steps fill. It keeps its place
// while nothing runs (`visibility`, not `display`), so the dialog does not jump when the export starts or ends
.progress {
  height: 3px;
  margin: 2px 0 4px;
  overflow: hidden;
  background: $border-dark;
  border-radius: 2px;

  &.is-hidden {
    visibility: hidden;
  }

  .bar {
    height: 100%;
    background: $interactive;
    transition: width 120ms linear;
  }
}

// why the file is not there
.failure {
  margin: 4px 0 0;
  color: $danger-bright;
  font-size: 0.9em;
}

// the button of the dialog: the primary action, the only one with a frame of its own, as wide as the dialog (the way the
// dialog of the data directory draws its one button)
.export {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  color: $text-strong;
  font: inherit;
  background: $surface-raised;
  border: 1px solid $border-strong;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-float;
    border-color: $interactive;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }

  // the turning mark of a wait: the packing blocks the thread, but a `transform` animation is turned by the compositor,
  // so it keeps going while the level is packed
  .spinner {
    animation: ExportMap-spin 1.2s linear infinite;
  }

  // the end of an export: a green check for a file that went to the browser, a red cross for one that did not
  &.is-done .mark {
    color: $ok;
  }

  &.is-failed .mark {
    color: $danger-bright;
  }
}

@keyframes ExportMap-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
