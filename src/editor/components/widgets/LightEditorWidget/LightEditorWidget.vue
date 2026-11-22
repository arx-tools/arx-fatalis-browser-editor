<script setup lang="ts">
import type { ArxLight } from 'arx-convert/types'
import { Power } from 'lucide-vue-next'
import { computed, onBeforeUnmount, reactive, watch, type ComputedRef } from 'vue'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetLightRecord, type LightChange, type SetLightEdit } from '../../../modules/history/records.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { lightsRevision, touchLights } from '../../../modules/level/edit/lightEditing.ts'
import { refreshLightPalette, type LightPaletteChange } from '../../../modules/level/edit/lightPalette.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import Notice from '../../Notice.vue'
import ToggleButton from '../../ToggleButton.vue'
import NumberField from '../../NumberField.vue'
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
 * The numeric fields of the widget, with the step of their arrows and the lowest value they take.
 *
 * @remarks
 * The fields were `type="number"` inputs until 2026-11-21: the spinner of the number input is wide in firefox, and the
 * editor writes every number in the same {@link NumberField}. The step is the one the native arrows had; the lowest value
 * is the `min` of the old inputs (the two falloff radii and the intensity never go below zero).
 */
const NUMBER_FIELDS = [
  { name: 'intensity', step: 0.01, min: 0 },
  { name: 'fallStart', step: 1, min: 0 },
  { name: 'fallEnd', step: 1, min: 0 },
  { name: 'exRadius', step: 1, min: undefined },
  { name: 'exFrequency', step: 0.01, min: undefined },
  { name: 'exSize', step: 0.01, min: undefined },
  { name: 'exSpeed', step: 0.01, min: undefined },
  { name: 'exFlareSize', step: 1, min: undefined },
] as const

/**
 * The name of one numeric field.
 */
type NumberFieldName = (typeof NUMBER_FIELDS)[number]['name']

/**
 * The text of every number field, the way the author typed it.
 *
 * @remarks
 * The field shows the text and not the number, so a half typed value is not formatted under the hand. The text goes back
 * to the number when the field is left; a text that is not a number keeps the value the light had, and the field shows
 * the red edge (2026-11-21, the owner).
 */
const numberTexts = reactive<Record<NumberFieldName, string>>({
  intensity: String(fields.intensity),
  fallStart: String(fields.fallStart),
  fallEnd: String(fields.fallEnd),
  exRadius: String(fields.exRadius),
  exFrequency: String(fields.exFrequency),
  exSize: String(fields.exSize),
  exSpeed: String(fields.exSpeed),
  exFlareSize: String(fields.exFlareSize),
})

/**
 * Whether the text of a number field is not a number the light can take.
 */
const invalidNumberFields = reactive<Partial<Record<NumberFieldName, boolean>>>({})

/**
 * The step and the lowest value of a numeric field.
 *
 * @param name The field to look up.
 *
 * @returns The entry of the field.
 */
function numberFieldOf(name: NumberFieldName): (typeof NUMBER_FIELDS)[number] {
  return (
    NUMBER_FIELDS.find((field) => {
      return field.name === name
    }) ?? NUMBER_FIELDS[0]
  )
}

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
 * This is the live half of the edit: the fields of the draft go to every selected light on the frame of the input, the
 * palette of the level is baked again where the light changed it, and the Light Inspector and the markers follow the
 * revision. The history does not see it yet; {@link commit} writes the step when the field is left.
 */
function writeLive(): void {
  const map = levelStore.map.value
  const current = selection.value

  if (map === undefined || current.kind !== 'ready') {
    return
  }

  const changes: LightChange[] = []
  const paletteChanges: LightPaletteChange[] = []

  for (const index of current.indices) {
    const base = map.lights[index]

    if (base !== undefined) {
      const light = lightWithFieldsOf(base, fields)

      changes.push({ index, light })
      // the light the map holds is the one before the write: it is what the palette baked, and the partial bake needs it
      paletteChanges.push({ before: base, after: light })
    }
  }

  if (changes.length === 0) {
    return
  }

  map.setLights(changes)
  refreshLightPalette(map, paletteChanges)
  dirty = true
  touchLights()
}

/**
 * Writes the step of the edit.
 *
 * @remarks
 * The step is the difference of the two snapshots; a field that went back to where it was is not a step. The palette is
 * not baked here: the live write has already moved the corners of the light, and the step bakes them again where it
 * changed the light (on the undo and the redo too, see `refreshLightPaletteOf`), so the two agree.
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
  }
}

/**
 * Writes the text of a number field, and the value when the text is a number the light can take.
 *
 * @remarks
 * A text that is empty, not a number, or below the lowest value keeps the value the light had, and the field shows the
 * red edge: a half cleared field must not blank the light of the level (2026-11-21, the owner).
 *
 * @param name The field that was typed in.
 * @param raw The text of the field.
 */
function onNumberInput(name: NumberFieldName, raw: string): void {
  numberTexts[name] = raw

  const parsed = Number(raw)
  const field = numberFieldOf(name)
  const valid = raw.trim() !== '' && Number.isFinite(parsed) && (field.min === undefined || parsed >= field.min)

  if (!valid) {
    invalidNumberFields[name] = true

    return
  }

  invalidNumberFields[name] = false
  fields[name] = parsed
  writeLive()
}

/**
 * Steps a numeric field with the arrows, and writes the step.
 *
 * @param name The field to step.
 * @param direction `1` steps up, `-1` steps down.
 */
function onNumberStep(name: NumberFieldName, direction: 1 | -1): void {
  const field = numberFieldOf(name)
  let current = fields[name]

  if (!Number.isFinite(current)) {
    current = 0
  }

  const stepSize = direction * field.step
  let next = Number((current + stepSize).toFixed(6))

  if (field.min !== undefined) {
    next = Math.max(field.min, next)
  }

  fields[name] = next
  numberTexts[name] = String(next)
  invalidNumberFields[name] = false
  writeLive()
  commit()
}

/**
 * Leaves a numeric field: the text goes back to the value of the light, and the edit becomes a step.
 *
 * @param name The field that lost the focus.
 */
function onNumberBlur(name: NumberFieldName): void {
  numberTexts[name] = String(fields[name])
  invalidNumberFields[name] = false
  commit()
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

  for (const field of NUMBER_FIELDS) {
    numberTexts[field.name] = String(fields[field.name])
    invalidNumberFields[field.name] = false
  }

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
 * @param pressed Whether the flag is being turned on.
 */
function toggleFlag(bit: number, pressed: boolean): void {
  let flags = fields.flags & ~bit

  if (pressed) {
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
    <Notice v-if="selection.kind === 'empty'" class="message">Select a light to edit.</Notice>
    <Notice v-else-if="selection.kind === 'mismatch'" class="message is-mismatch">
      {{ mismatchMessage }}
    </Notice>
    <div v-else class="fields">
      <div class="field">
        <span class="caption">Colour</span>
        <LightColorPicker v-model="fields.color" @update:model-value="writeLive" @change="commit" />
      </div>
      <div class="row">
        <span class="caption">Intensity</span>
        <NumberField
          :model-value="numberTexts.intensity"
          :invalid="invalidNumberFields.intensity"
          label="Intensity"
          step
          @update:model-value="onNumberInput('intensity', $event)"
          @blur="onNumberBlur('intensity')"
          @step="onNumberStep('intensity', $event)"
        />
      </div>
      <div class="row">
        <span class="caption">Fall start</span>
        <NumberField
          :model-value="numberTexts.fallStart"
          :invalid="invalidNumberFields.fallStart"
          label="Fall start"
          step
          @update:model-value="onNumberInput('fallStart', $event)"
          @blur="onNumberBlur('fallStart')"
          @step="onNumberStep('fallStart', $event)"
        />
      </div>
      <div class="row">
        <span class="caption">Fall end</span>
        <NumberField
          :model-value="numberTexts.fallEnd"
          :invalid="invalidNumberFields.fallEnd"
          label="Fall end"
          step
          @update:model-value="onNumberInput('fallEnd', $event)"
          @blur="onNumberBlur('fallEnd')"
          @step="onNumberStep('fallEnd', $event)"
        />
      </div>
      <div class="flags">
        <div v-for="flag in BASIC_LIGHT_FLAGS" :key="flag.bit" class="flag">
          <span>{{ flag.label }}</span>
          <ToggleButton :pressed="hasFlag(flag.bit)" :label="flag.label" @update:pressed="toggleFlag(flag.bit, $event)">
            <Power :size="14" />
          </ToggleButton>
        </div>
      </div>
      <details class="advanced">
        <summary>Advanced</summary>
        <div class="field">
          <span class="caption">Flicker</span>
          <LightColorPicker v-model="fields.exFlicker" @update:model-value="writeLive" @change="commit" />
        </div>
        <div class="row">
          <span class="caption">exRadius</span>
          <NumberField
            :model-value="numberTexts.exRadius"
            :invalid="invalidNumberFields.exRadius"
            label="exRadius"
            step
            @update:model-value="onNumberInput('exRadius', $event)"
            @blur="onNumberBlur('exRadius')"
            @step="onNumberStep('exRadius', $event)"
          />
        </div>
        <div class="row">
          <span class="caption">exFrequency</span>
          <NumberField
            :model-value="numberTexts.exFrequency"
            :invalid="invalidNumberFields.exFrequency"
            label="exFrequency"
            step
            @update:model-value="onNumberInput('exFrequency', $event)"
            @blur="onNumberBlur('exFrequency')"
            @step="onNumberStep('exFrequency', $event)"
          />
        </div>
        <div class="row">
          <span class="caption">exSize</span>
          <NumberField
            :model-value="numberTexts.exSize"
            :invalid="invalidNumberFields.exSize"
            label="exSize"
            step
            @update:model-value="onNumberInput('exSize', $event)"
            @blur="onNumberBlur('exSize')"
            @step="onNumberStep('exSize', $event)"
          />
        </div>
        <div class="row">
          <span class="caption">exSpeed</span>
          <NumberField
            :model-value="numberTexts.exSpeed"
            :invalid="invalidNumberFields.exSpeed"
            label="exSpeed"
            step
            @update:model-value="onNumberInput('exSpeed', $event)"
            @blur="onNumberBlur('exSpeed')"
            @step="onNumberStep('exSpeed', $event)"
          />
        </div>
        <div class="row">
          <span class="caption">exFlareSize</span>
          <NumberField
            :model-value="numberTexts.exFlareSize"
            :invalid="invalidNumberFields.exFlareSize"
            label="exFlareSize"
            step
            @update:model-value="onNumberInput('exFlareSize', $event)"
            @blur="onNumberBlur('exFlareSize')"
            @step="onNumberStep('exFlareSize', $event)"
          />
        </div>
        <div class="flags">
          <div v-for="flag in ADVANCED_LIGHT_FLAGS" :key="flag.bit" class="flag">
            <span>{{ flag.label }}</span>
            <ToggleButton
              :pressed="hasFlag(flag.bit)"
              :label="flag.label"
              @update:pressed="toggleFlag(flag.bit, $event)"
            >
              <Power :size="14" />
            </ToggleButton>
          </div>
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
  // the same inset as the other widgets of the info work: the heading's rule and the content start at the same place
  // (2026-11-22, the owner)
  padding: 0 8px 8px;
  overflow: hidden;

  .message {
    margin: 0;
    padding: 8px 0;
    color: $text-muted;
    font-size: 12px;
  }

  .message.is-mismatch {
    line-height: 1.4;
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
    padding: 4px 0 2px;
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

  .NumberField {
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

  .NumberField:focus-visible {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }

  .flags {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 16px;
    margin-top: 4px;
  }

  // the rule between the two columns of the flags: the switches are right aligned against it, and the captions of the
  // next column start a breath later. It is a pseudo-element, so the flags stay one two-column grid (the rule is not a
  // third column the auto-placement would have to skip), and the line spans the rows of the group
  .flags::after {
    position: absolute;
    inset-block: 0;
    left: calc(50% - 0.5px);
    width: 1px;
    background: $border;
    content: '';
    pointer-events: none;
  }

  .flag {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: $text-muted;
    font-size: 11px;
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
