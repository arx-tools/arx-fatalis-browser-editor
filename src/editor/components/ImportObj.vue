<script setup lang="ts">
import { FileUp, LoaderCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { BLANK_LEVEL_TEXTURE } from '../../generator/assets.ts'
import { commandOf } from '../modules/history/commands.ts'
import { createImportMeshRecord } from '../modules/history/records/import.ts'
import { runStep } from '../modules/level/edit/editing.ts'
import { levelStore } from '../modules/level/edit/levelStore.ts'
import { DEFAULT_OBJ_SCALE, polygonsOfObj } from '../modules/level/import/objPolygons.ts'
import { NO_ROOM } from '../modules/rooms/roomList.ts'
import { selectionStore } from '../modules/selection/selectionStore.ts'
import Button from './Button.vue'
import Modal from './Modal.vue'

/**
 * How an OBJ file comes into the level: a mesh of its own, at the origin of the level, in a room of its own.
 *
 * @remarks
 * The dialog is the way in of the mesh (TODO 304): a file, the scale and the three turns, and the faces are built into
 * the level with the step of the history (see `importMeshCommandOf`), so the undo takes them out again. The mesh goes to
 * the **origin of the level**, which is the scene position and the middle of the editor's own space (2026-11-26, the
 * owner), and it makes a **room of its own**: the faces of the level and the faces of the file do not share a room, and
 * the room map reads the new mesh as one piece. After the step the new faces are the **selection**, so the gizmos, the
 * texture mapper and the selection inspector work on them right away.
 *
 * The texture is the **missing texture of the generator** (`jorge-[stone].jpg`, the placeholder of a face without a
 * texture), and the painting is a step of its own: the MTL of the file is TODO 305, and a hand painted face is a
 * `setTexture` step the editor already has.
 */
const isOpen = ref(false)

/**
 * The name of the file the author chose, for the dialog.
 */
const fileName = ref('')

/**
 * The text of the file, ready for the step.
 */
const raw = ref<string>()

/**
 * How much a unit of the file grows, in the units of the game.
 */
const scale = ref<number>(DEFAULT_OBJ_SCALE)

/**
 * How the mesh is turned, in degrees, around the axes of the game.
 */
const rotation = ref({ x: 0, y: 0, z: 0 })

/**
 * What the import does now: the parse of a big file is not a moment, so the button says when it runs.
 */
const busy = ref(false)

/**
 * The reason of a failed import, when one failed.
 */
const failure = ref('')

/**
 * The level on the screen: the import writes it.
 */
const map = computed(() => {
  return levelStore.map.value
})

/**
 * Whether the dialog has something to import.
 */
const canImport = computed(() => {
  return !busy.value && raw.value !== undefined && map.value !== undefined
})

/**
 * The line under the file field: the name of the file, or the invitation to choose one.
 */
const fileNameLabel = computed(() => {
  if (fileName.value === '') {
    return 'no file chosen'
  }

  return fileName.value
})

/**
 * Whether the file field has a file yet.
 */
const hasFileName = computed(() => {
  return fileName.value !== ''
})

/**
 * The file input of the dialog, which the button of the dialog opens.
 */
const fileInput = ref<HTMLInputElement>()

/**
 * Opens the dialog.
 */
function open(): void {
  failure.value = ''
  isOpen.value = true
}

/**
 * Closes the dialog.
 */
function close(): void {
  if (busy.value) {
    return
  }

  isOpen.value = false
}

/**
 * Opens the picker of the file.
 */
function chooseFile(): void {
  fileInput.value?.click()
}

/**
 * Reads the text of the file the author chose.
 *
 * @param event The change of the file input.
 */
async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file === undefined) {
    return
  }

  failure.value = ''
  fileName.value = file.name
  raw.value = await file.text()
}

/**
 * Waits for the next frame, so a long step shows the dialog of its state before it runs.
 *
 * @returns A promise that resolves on the next frame.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

/**
 * Builds the faces of the file into the level, as one step of the history.
 *
 * @remarks
 * The container of the missing texture is the one of the level when it has one (a blank level does: its floor draws with
 * it), and a new one otherwise (a level of the game, where the author never used that texture). The step adds it and the
 * undo takes it away with the faces, so the two halves are one.
 */
async function importMesh(): Promise<void> {
  const level = map.value
  const text = raw.value

  if (level === undefined || text === undefined) {
    return
  }

  busy.value = true
  failure.value = ''

  // the parse of a file of a few thousand faces ties the frame: the dialog says it runs before the work starts
  await nextFrame()

  try {
    const containerId = level.textureContainerIdOfName(BLANK_LEVEL_TEXTURE)
    const texture = { id: containerId ?? level.nextTextureContainerId(), name: BLANK_LEVEL_TEXTURE }
    const polygons = polygonsOfObj(text, {
      scale: scale.value,
      rotation: rotation.value,
      origin: level.scenePosition,
      textureContainerId: texture.id,
      // the faces of the mesh are in no room: the game draws the polygons from the rooms of the level, so a face in no
      // room has a collision and no picture (2026-11-27, the owner's test). A room of its own does not help, because the
      // faces of the level are in theirs: the author puts the mesh into the rooms of the level it stands in (the Room
      // Inspector's moves), and until then the export says that the faces have no room (2026-11-27, the owner)
      room: NO_ROOM,
    })

    if (polygons.length === 0) {
      failure.value = 'The file has no face the editor can import.'

      return
    }

    const first = level.polygons.length
    const command = commandOf(createImportMeshRecord(polygons, texture, containerId === undefined), level)

    if (command === undefined) {
      failure.value = 'The level can not take the mesh.'

      return
    }

    runStep(command)
    selectionStore.selectMany(
      Array.from({ length: polygons.length }, (_unused, position) => {
        return first + position
      }),
      'replace',
    )

    isOpen.value = false
  } catch (error: unknown) {
    if (error instanceof Error) {
      failure.value = error.message
    } else {
      failure.value = String(error)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="ImportObj">
    <button
      class="open"
      type="button"
      :disabled="!map"
      aria-label="Import a mesh from an OBJ file"
      v-tooltip="'Import a mesh from an OBJ file'"
      @click="open"
    >
      <FileUp :size="14" />
      <span class="label">Import OBJ</span>
    </button>
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      accept=".obj,text/plain"
      aria-label="An OBJ file"
      @change="readFile"
    />

    <Modal v-if="isOpen" title="Import OBJ" @close="close">
      <div class="field">
        <label for="import-obj-file">File</label>
        <div class="file-row">
          <button class="choose" type="button" @click="chooseFile">Choose file</button>
          <span class="file-name" :class="{ 'is-empty': !hasFileName }">{{ fileNameLabel }}</span>
        </div>
        <p class="helper">
          The mesh goes to the origin of the level, in a room of its own, with the missing texture. Paint the faces with
          the Texture Mapper after the import.
        </p>
      </div>

      <div class="field">
        <label for="import-obj-scale">Scale</label>
        <input id="import-obj-scale" v-model.number="scale" type="number" step="1" min="0" autocomplete="off" />
        <p class="helper">
          How much a unit of the file grows: one keeps the units of the file, and a hundred puts a meter of the model
          into the centimeters of the game.
        </p>
      </div>

      <div class="field">
        <label>Rotation</label>
        <div class="turns">
          <label for="import-obj-rotation-x">
            <span>X</span>
            <input id="import-obj-rotation-x" v-model.number="rotation.x" type="number" step="15" autocomplete="off" />
          </label>
          <label for="import-obj-rotation-y">
            <span>Y</span>
            <input id="import-obj-rotation-y" v-model.number="rotation.y" type="number" step="15" autocomplete="off" />
          </label>
          <label for="import-obj-rotation-z">
            <span>Z</span>
            <input id="import-obj-rotation-z" v-model.number="rotation.z" type="number" step="15" autocomplete="off" />
          </label>
        </div>
        <p class="helper">In degrees, applied in the order of the axes. The new faces are selected after the import.</p>
      </div>

      <p v-if="failure !== ''" class="failure">{{ failure }}</p>

      <template #actions>
        <Button class="import" label="Import" :disabled="!canImport" @click="importMesh">
          <LoaderCircle v-if="busy" class="spinner" :size="14" />
          <FileUp v-else :size="14" />
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the way in of a mesh: the same frame as the buttons of the header, with its own label
.ImportObj {
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

  // the picker of the file: the button of the dialog is the way in, the input stays out of the way of the header
  .file-input {
    display: none;
  }
}

// the dialog: `Modal.vue` teleports its content to the body, so these elements are **not** under `.ImportObj`, and the
// styles of the dialog are at the top level of the block

// one value of the dialog: the label above the field, the helper lines under it (the same as the export dialog)
.field {
  margin-bottom: 14px;

  > label {
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

  .helper {
    margin: 3px 0 0;
    color: $text-subtle;
    font-size: 0.9em;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .choose {
    flex: none;
    padding: 4px 8px;
    color: $text-strong;
    font: inherit;
    background: $surface-raised;
    border: 1px solid $border-strong;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background: $surface-float;
      border-color: $interactive;
    }
  }

  .file-name {
    overflow: hidden;
    color: $text;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-empty {
      color: $text-subtle;
    }
  }

  .turns {
    display: flex;
    gap: 8px;

    label {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 6px;

      span {
        flex: none;
        width: 12px;
        color: $text-muted;
      }
    }
  }
}

.failure {
  margin: 0 0 14px;
  color: $danger-bright;
}

.spinner {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
