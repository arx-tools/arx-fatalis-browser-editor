<script setup lang="ts">
import type { ArxLight } from 'arx-convert/types'
import { computed, onBeforeUnmount, reactive, watch, type ComputedRef } from 'vue'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetLightRecord, type LightChange, type SetLightEdit } from '../../../modules/history/records.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { lightsRevision, touchLights } from '../../../modules/level/edit/lightEditing.ts'
import { bakeLighting } from '../../../modules/level/edit/lighting.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import LightColorPicker from './LightColorPicker.vue'
import {
  ADVANCED_LIGHT_FLAGS,
  BASIC_LIGHT_FLAGS,
  fieldsOfLight,
  lightMismatchMessageOf,
  lightSelectionOf,
  lightWithFieldsOf,
  sameLightEditableFields,
  type LightFields,
  type LightSelection,
} from './lightEditor.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * A light with nothing in it, so the fields have a shape before the first selection.
 */
const BLANK_LIGHT: ArxLight = {
  position: { x: 0, y: 0, z: 0 },
  color: { r: 0, g: 0, b: 0, a: 255 },
  fallStart: 0,
  fallEnd: 0,
  intensity: 0,
  exFlicker: { r: 0, g: 0, b: 0, a: 255 },
  exRadius: 0,
  exFrequency: 0,
  exSize: 0,
  exSpeed: 0,
  exFlareSize: 0,
  flags: 0,
}

/**
 * The fields the author edits.
 */
const fields = reactive<LightFields>(fieldsOfLight(BLANK_LIGHT))

/**
 * The lights of the selection at the last load or commit, so the step has its two snapshots.
 */
let before: Array<{ readonly index: number; readonly light: ArxLight }> = []

/**
 * Whether the fields were edited since the last load or commit.
 */
let dirty = false

/**
 * Reads the selection from the level and the store, fresh.
 *
 * @remarks
 * The lights of the map are a plain list, so a light the editor just wrote is not a signal: a caller that wants the
 * current lights (the revision watch) reads them again instead of the cached selection of the render.
 *
 * @returns What the widget can do with the selection.
 */
function readSelection(): LightSelection {
  const map = levelStore.map.value

  if (map === undefined) {
    return { kind: 'empty' }
  }

  return lightSelectionOf(map.lights, lightSelectionStore.lights.value)
}

/**
 * The lights the editor sees: the selection, and what the widget can do with it.
 */
const selection: ComputedRef<LightSelection> = computed(() => {
  return readSelection()
})

/**
 * The sentence of the mismatch, when the selection has more than one light and they differ.
 */
const mismatchMessage = computed(() => {
  const current = selection.value

  if (current.kind !== 'mismatch') {
    return ''
  }

  return lightMismatchMessageOf(current.reasons)
})

/**
 * Copies a light, so the step and the fields do not share a vector with the level.
 *
 * @param light The light to copy.
 *
 * @returns The light, with vectors of its own.
 */
function cloneLightOf(light: ArxLight): ArxLight {
  return {
    ...light,
    position: { ...light.position },
    color: { ...light.color },
    exFlicker: { ...light.exFlicker },
  }
}

/**
 * Writes the fields to the selected lights, and tells the markers.
 *
 * @remarks
 * This is the live half of the edit: the fields of the draft go to every selected light on the frame of the input, and
 * the Light Inspector and the markers follow the revision. The history does not see it yet; {@link commit} writes the
 * step when the field is left.
 */
function writeLive(): void {
  const map = levelStore.map.value
  const current = selection.value

  if (map === undefined || current.kind !== 'ready') {
    return
  }

  const changes: LightChange[] = []

  for (const index of current.indices) {
    const base = map.lights[index]

    if (base !== undefined) {
      changes.push({ index, light: lightWithFieldsOf(base, fields) })
    }
  }

  if (changes.length === 0) {
    return
  }

  map.setLights(changes)
  dirty = true
  touchLights()
}

/**
 * Writes the step of the edit, and bakes the palette again.
 *
 * @remarks
 * The step is the difference of the two snapshots; a field that went back to where it was is not a step. The palette is
 * re-baked in full here until the partial bake of the live edit arrives (the light editor of the 245).
 */
function commit(): void {
  if (!dirty) {
    return
  }

  const map = levelStore.map.value

  if (map === undefined) {
    dirty = false
    return
  }

  const edits: SetLightEdit[] = []

  for (const entry of before) {
    const current = map.lights[entry.index]

    if (current !== undefined) {
      edits.push({ index: entry.index, before: entry.light, after: current })
    }
  }

  const changed = edits.filter((edit) => {
    return !sameLightEditableFields(edit.before, edit.after)
  })
  const snapshots: Array<{ readonly index: number; readonly light: ArxLight }> = []

  for (const entry of before) {
    const current = map.lights[entry.index]

    if (current !== undefined) {
      snapshots.push({ index: entry.index, light: cloneLightOf(current) })
    }
  }

  dirty = false
  before = snapshots

  if (changed.length === 0) {
    return
  }

  const command = commandOf(createSetLightRecord(changed), map)

  if (command !== undefined) {
    runStep(command)
    bakeLighting().catch((error: unknown) => {
      console.warn('[light-editor] the palette could not be baked again.', error)
    })
  }
}

/**
 * Loads the fields and the snapshots of a ready selection.
 *
 * @param current The selection the widget edits.
 */
function load(current: Extract<LightSelection, { kind: 'ready' }>): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  Object.assign(fields, fieldsOfLight(current.light))
  before = []

  for (const index of current.indices) {
    const light = map.lights[index]

    if (light !== undefined) {
      before.push({ index, light: cloneLightOf(light) })
    }
  }

  dirty = false
}

watch(selection, (current, previous) => {
  // the draft of the old selection is a step of its own before the new one arrives
  if (previous?.kind === 'ready') {
    commit()
  }

  if (current.kind === 'ready') {
    load(current)
  } else {
    before = []
    dirty = false
  }
})

// the steps that come from outside (the undo and the redo, another widget) move the fields with the level, but the draft
// of a running edit is the source while it is dirty
watch(lightsRevision, () => {
  if (dirty) {
    return
  }

  const current = readSelection()

  if (current.kind === 'ready') {
    load(current)
  }
})

onBeforeUnmount(() => {
  commit()
})

/**
 * Tells whether a flag of the fields is on.
 *
 * @param bit The bit of `ArxLightFlags`.
 *
 * @returns True when the flag is on.
 */
function hasFlag(bit: number): boolean {
  return (fields.flags & bit) !== 0
}

/**
 * Flips a flag of the fields, and writes the step at once.
 *
 * @param bit The bit of `ArxLightFlags`.
 * @param event The event of the checkbox.
 */
function toggleFlag(bit: number, event: Event): void {
  const enabled = (event.target as HTMLInputElement).checked
  let flags = fields.flags & ~bit

  if (enabled) {
    flags = fields.flags | bit
  }

  fields.flags = flags
  writeLive()
  commit()
}
</script>

<template>
  <div class="LightEditorWidget">
    <WidgetHeading :label="props.label" />
    <p v-if="selection.kind === 'empty'" class="message">Select a light to edit.</p>
    <p v-else-if="selection.kind === 'mismatch'" class="message is-mismatch">{{ mismatchMessage }}</p>
    <div v-else class="fields">
      <div class="field">
        <span class="caption">Colour</span>
        <LightColorPicker v-model="fields.color" @update:model-value="writeLive" @change="commit" />
      </div>
      <div class="row">
        <span class="caption">Intensity</span>
        <input
          v-model.number="fields.intensity"
          type="number"
          min="0"
          step="0.01"
          aria-label="Intensity"
          @input="writeLive"
          @change="commit"
        />
      </div>
      <div class="row">
        <span class="caption">Fall start</span>
        <input
          v-model.number="fields.fallStart"
          type="number"
          min="0"
          step="1"
          aria-label="Fall start"
          @input="writeLive"
          @change="commit"
        />
      </div>
      <div class="row">
        <span class="caption">Fall end</span>
        <input
          v-model.number="fields.fallEnd"
          type="number"
          min="0"
          step="1"
          aria-label="Fall end"
          @input="writeLive"
          @change="commit"
        />
      </div>
      <div class="flags">
        <label v-for="flag in BASIC_LIGHT_FLAGS" :key="flag.bit" class="flag">
          <input type="checkbox" :checked="hasFlag(flag.bit)" @change="toggleFlag(flag.bit, $event)" />
          <span>{{ flag.label }}</span>
        </label>
      </div>
      <details class="advanced">
        <summary>Advanced</summary>
        <div class="field">
          <span class="caption">Flicker</span>
          <LightColorPicker v-model="fields.exFlicker" @update:model-value="writeLive" @change="commit" />
        </div>
        <div class="row">
          <span class="caption">exRadius</span>
          <input
            v-model.number="fields.exRadius"
            type="number"
            step="1"
            aria-label="exRadius"
            @input="writeLive"
            @change="commit"
          />
        </div>
        <div class="row">
          <span class="caption">exFrequency</span>
          <input
            v-model.number="fields.exFrequency"
            type="number"
            step="0.01"
            aria-label="exFrequency"
            @input="writeLive"
            @change="commit"
          />
        </div>
        <div class="row">
          <span class="caption">exSize</span>
          <input
            v-model.number="fields.exSize"
            type="number"
            step="0.01"
            aria-label="exSize"
            @input="writeLive"
            @change="commit"
          />
        </div>
        <div class="row">
          <span class="caption">exSpeed</span>
          <input
            v-model.number="fields.exSpeed"
            type="number"
            step="0.01"
            aria-label="exSpeed"
            @input="writeLive"
            @change="commit"
          />
        </div>
        <div class="row">
          <span class="caption">exFlareSize</span>
          <input
            v-model.number="fields.exFlareSize"
            type="number"
            step="1"
            aria-label="exFlareSize"
            @input="writeLive"
            @change="commit"
          />
        </div>
        <div class="flags">
          <label v-for="flag in ADVANCED_LIGHT_FLAGS" :key="flag.bit" class="flag">
            <input type="checkbox" :checked="hasFlag(flag.bit)" @change="toggleFlag(flag.bit, $event)" />
            <span>{{ flag.label }}</span>
          </label>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.LightEditorWidget {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  .message {
    margin: 0;
    padding: 8px 10px;
    color: $text-muted;
    font-size: 12px;
  }

  .message.is-mismatch {
    color: $text-dim;
    line-height: 1.4;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    padding: 4px 10px 10px;
    overflow-y: auto;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;

    > .caption {
      color: $text-muted;
      font-size: 12px;
      text-align: left;
    }
  }

  .row {
    display: grid;
    grid-template-columns: 72px 1fr;
    align-items: center;
    gap: 8px;
  }

  .caption {
    color: $text-muted;
    font-size: 12px;
    text-align: right;
  }

  p + .fields,
  .row + .row {
    margin-top: 0;
  }

  input[type='number'] {
    width: 100%;
    height: 22px;
    padding: 0 6px;
    color: $text;
    font: inherit;
    font-size: 12px;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
  }

  input[type='number']:focus-visible {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }

  .flags {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 8px;
    margin-top: 4px;
  }

  .flag {
    display: flex;
    align-items: center;
    gap: 4px;
    color: $text-muted;
    font-size: 11px;
    cursor: pointer;
  }

  .flag input {
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
  }

  .advanced {
    margin-top: 2px;

    > summary {
      color: $text-muted;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }

    > .field,
    > .row,
    > .flags {
      margin-top: 4px;
    }
  }
}
</style>
