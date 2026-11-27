<script setup lang="ts">
import { Check, Download, LoaderCircle, X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { downloadBinaryAs } from '../modules/export/download.ts'
import { exportLevelZip } from '../modules/export/exportLevel.ts'
import { authorName, projectHomepage } from '../modules/export/authorFields.ts'
import { faceGroupsJsonOf } from '../modules/groups/groupPersistence.ts'
import { roomNamesJson } from '../modules/rooms/roomNames.ts'
import { authorOf, exportSeedOf, levelIndexOf, projectOf } from '../modules/export/exportOptions.ts'
import { isDynamicLightsVisible, isStaticLightOn } from '../modules/level/edit/dynamicLights.ts'
import { snapshotOfHistory } from '../modules/level/edit/editing.ts'
import { levelSeed } from '../modules/level/seed.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import { currentMapId, currentMapManifest, poseOfMap } from '../modules/level/source/maps.ts'
import { exportTexturesFor } from '../modules/export/exportTextures.ts'
import { levelTextureSources } from '../modules/textures/textureCatalog.ts'
import { roomProblemsOf } from '../modules/rooms/roomProblems.ts'
import Modal from './Modal.vue'
import SectionTitle from './SectionTitle.vue'
import NumberField from './NumberField.vue'
import Button from './Button.vue'

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
 * What the archive took from the textures of the level, as the dialog says it when the export is done.
 */
const summary = ref('')

/**
 * Reads the count of the textures of an archive as a sentence.
 *
 * @param textures How many textures the archive carries.
 *
 * @returns The sentence, or an empty one when the archive carries none.
 */
function texturesOfText(textures: number): string {
  if (textures === 0) {
    return ''
  }

  if (textures === 1) {
    return 'The archive carries the one texture the game does not have.'
  }

  return `The archive carries the ${String(textures)} textures the game does not have.`
}

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
 * What is wrong with the rooms of the level, the lines the Room Inspector shows as warnings.
 *
 * @remarks
 * A face in no room is a face the game draws nowhere (it has a collision only), so the dialog says it before the archive
 * is written (2026-11-27, the owner). The notices of the panel are consequences of the level and not problems, so they
 * stay out of the way of the export.
 */
const warnings = computed(() => {
  const current = map.value

  if (current === undefined) {
    return []
  }

  return roomProblemsOf(current).filter((problem) => {
    return problem.kind === 'warning'
  })
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
 * The tone of the export button: the plain plate, the finished export or the failed one.
 */
const exportTone = computed<'plain' | 'ok' | 'danger'>(() => {
  if (state.value === 'done') {
    return 'ok'
  }

  if (state.value === 'failed') {
    return 'danger'
  }

  return 'plain'
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

  // the manifest of the zip the level came from stands in an empty field: what the author typed before wins
  const inherited = currentMapManifest.value

  if (authorName.value === '' && inherited?.author?.name !== undefined) {
    authorName.value = inherited.author.name
  }

  if (projectHomepage.value === '' && inherited?.project?.homepage !== undefined) {
    projectHomepage.value = inherited.project.homepage
  }

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
  summary.value = ''

  // the button has to read as busy **before** the packing takes the thread: one frame of it
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })

  try {
    // the textures the game does not have: the pictures of the level's zip and the placeholder of the generator. They
    // are read here, where the page can fetch an asset of the build, and the archive only writes the bytes
    const textures = await exportTexturesFor(current, levelTextureSources())

    const { name, data } = await exportLevelZip(
      current,
      (value): void => {
        percent.value = value
      },
      {
        levelIndex: levelIndexOf(String(levelIndex.value)),
        // the switches of the light layer: a layer that is off is not in the file, and a static-off level is dark.
        // The profiles with a light of their own read no light, so their palette is in the file whatever the switch says
        staticLights: isStaticLightOn(),
        dynamicLights: isDynamicLightsVisible.value,
        // an empty field means the seed the level already has (the number the game's generator made for it)
        seed: exportSeedOf(seed.value) ?? current.settings.seed,
        // the base the zip came with (the name of the mod, its version, its author), which the archive keeps, and the
        // pose of the camera on the level, which a zip opens on
        manifest: currentMapManifest.value,
        camera: poseOfMap(currentMapId.value),
        author: authorOf(authorName.value),
        project: projectOf(projectHomepage.value),
        roomNames: roomNamesJson(),
        groups: faceGroupsJsonOf(),
        // the steps of the level: an archive with them is a save of the level, not only its result
        history: snapshotOfHistory(),
        textures: textures.textures,
      },
    )

    summary.value = texturesOfText(textures.textures.length)
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
        <NumberField
          id="export-level-index"
          :model-value="String(levelIndex)"
          label="Level index"
          inputmode="numeric"
          @update:model-value="levelIndex = $event"
        />
        <p class="helper">Set to 1 to make Arx Fatalis load the map upon starting a new quest.</p>
      </div>

      <div class="field">
        <label for="export-author-name">Author's name</label>
        <input id="export-author-name" v-model="authorName" type="text" autocomplete="off" />
      </div>

      <div class="field">
        <label for="export-homepage">Project homepage</label>
        <input id="export-homepage" v-model="projectHomepage" type="text" autocomplete="off" />
        <p class="helper">A link to a moddb or nexusmods page or a custom website where this mod is hosted.</p>
      </div>

      <!-- the bar is always in the dialog, hidden while nothing runs: a removed element would make the dialog jump -->
      <div class="progress" :class="{ 'is-hidden': state !== 'packing' }">
        <div class="bar" :style="{ width: `${percent}%` }"></div>
      </div>

      <section v-if="warnings.length > 0" class="warnings">
        <SectionTitle>Warnings</SectionTitle>
        <p v-for="warning in warnings" :key="warning.text" class="warning">{{ warning.text }}</p>
      </section>

      <p v-if="summary !== ''" class="summary">{{ summary }}</p>

      <p v-if="failure !== ''" class="failure">{{ failure }}</p>

      <template #actions>
        <Button class="export" :label="label" :tone="exportTone" :disabled="state === 'packing'" @click="exportIt">
          <LoaderCircle v-if="state === 'packing'" class="spinner" :size="14" />
          <Check v-else-if="state === 'done'" class="mark" :size="14" />
          <X v-else-if="state === 'failed'" class="mark" :size="14" />
          <Download v-else :size="14" />
        </Button>
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

  // the line under the field: what the value means, in the gray of a caption (the material ui helper text)
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

// the problems of the level the Room Inspector shows too: the author has to fix them before the archive goes out, so
// they read in the warning color with the title of the inspector. The section **breaks out** of the padding of the
// dialog (the 12px of `Modal`'s body), so the line over it runs from edge to edge, and the content keeps the inset of
// the rest of the dialog (2026-11-27, the owner)
.warnings {
  margin: 0 -12px 14px;
  padding: 8px 12px 0;
  border-top: 1px solid $border-dark;

  // the title of the inspector carries the inset of the panel's rows; in the dialog the warnings start where the fields
  // start, so the two lines keep no horizontal padding (2026-11-27, the owner)
  .SectionTitle {
    padding: 0;
  }
}

// the title of the block is the one of the Room Inspector (`SectionTitle`: a small white caption), so the two read the
// same wherever the warnings of the level are shown

.warning {
  margin: 0 0 2px;
  color: $accent;
  font-size: 12px;
  line-height: 1.35;
}

// what the archive took from the textures of the level: a note, so it reads quiet next to a warning
.summary {
  margin: 0 0 14px;
  color: $text-muted;
}

// why the file is not there
.failure {
  margin: 4px 0 0;
  color: $danger-bright;
  font-size: 0.9em;
}

// the button of the dialog: the primary action, the only one with a frame of its own, as wide as the dialog (the way the
// dialog of the data directory draws its one button)
@keyframes ExportMap-spin {
  to {
    transform: rotate(1turn);
  }
}
</style>
