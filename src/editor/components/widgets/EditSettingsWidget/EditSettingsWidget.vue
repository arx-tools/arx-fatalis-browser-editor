<script setup lang="ts">
import { Power } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import {
  snapEdgeEnabled,
  snapEnabled,
  snapPlaneEnabled,
  snapThresholdPx,
  snapVertexEnabled,
} from '../shared/snapping.ts'

/**
 * The master switch of the snapping, bound to the power button.
 *
 * @remarks
 * It is the same state the magnet of the 3D view writes: the two are one switch, so the author can turn the snap on
 * here and grab a face in the view, and the magnet lights up.
 */
const enabled = computed<boolean>({
  get: (): boolean => {
    return snapEnabled.value
  },
  set: (value: boolean): void => {
    snapEnabled.value = value
  },
})

/**
 * Whether the snap may take a corner to a vertex of the level.
 */
const vertex = computed<boolean>({
  get: (): boolean => {
    return snapVertexEnabled.value
  },
  set: (value: boolean): void => {
    snapVertexEnabled.value = value
  },
})

/**
 * Whether the snap may rail the edge of the selection on an edge of the level.
 */
const edge = computed<boolean>({
  get: (): boolean => {
    return snapEdgeEnabled.value
  },
  set: (value: boolean): void => {
    snapEdgeEnabled.value = value
  },
})

/**
 * Whether the snap may land a corner on the plane of a face of the level.
 */
const plane = computed<boolean>({
  get: (): boolean => {
    return snapPlaneEnabled.value
  },
  set: (value: boolean): void => {
    snapPlaneEnabled.value = value
  },
})

/**
 * The text of the tooltip of the master switch: what the next click does.
 */
const snappingTooltip = computed<string>(() => {
  if (enabled.value) {
    return 'Turn the snapping off'
  }

  return 'Turn the snapping on'
})

/**
 * The farthest a snap may take the selection, as the text of the field.
 *
 * @remarks
 * The field is a text input and not a number one: the spinners of the number field of firefox are ugly (the owner,
 * 2026-11-21, the same reason the camera form is text), and the value is a whole number between 1 and 80, written out
 * by this ref. The ref below is the one the snaps read.
 */
const thresholdText = ref<string>(String(snapThresholdPx.value))

/**
 * The farthest a snap may take the selection, in pixels, between the allowed ends.
 *
 * @param value The number to clamp.
 *
 * @returns The value inside the range.
 */
function clamped(value: number): number {
  return Math.min(80, Math.max(1, value))
}

watch(snapThresholdPx, (value) => {
  thresholdText.value = String(value)
})

/**
 * Writes the number of the field, and shows the value the ref took.
 *
 * @remarks
 * A number out of the range is clamped as it is typed, and the field shows the clamped value: the stored setting is
 * always one the next build can read (the `deserialize` of the ref checks it too). An empty or half typed field keeps
 * its text and does not touch the setting; the blur puts the number back.
 *
 * @param event The input event of the field.
 */
function onThresholdInput(event: Event): void {
  const field = event.target as HTMLInputElement
  const raw = field.value
  const parsed = Number.parseInt(raw, 10)

  if (!Number.isFinite(parsed)) {
    thresholdText.value = raw

    return
  }

  snapThresholdPx.value = clamped(parsed)

  if (parsed === snapThresholdPx.value) {
    thresholdText.value = raw

    return
  }

  thresholdText.value = String(snapThresholdPx.value)
}

/**
 * Steps the threshold with the arrows of the keyboard, the way the camera form does.
 *
 * @param direction The step: up is one more, down is one less.
 */
function stepThreshold(direction: 1 | -1): void {
  snapThresholdPx.value = clamped(snapThresholdPx.value + direction)
  thresholdText.value = String(snapThresholdPx.value)
}

/**
 * Puts the number of the setting back into the field, when the focus leaves it.
 */
function onThresholdBlur(): void {
  thresholdText.value = String(snapThresholdPx.value)
}
</script>

<template>
  <div class="EditSettingsWidget">
    <div class="field">
      <span class="caption">Snapping</span>
      <div class="row">
        <button
          class="power"
          :class="{ 'is-on': enabled }"
          type="button"
          :aria-pressed="enabled"
          aria-label="Snapping"
          v-tooltip="{ content: snappingTooltip }"
          @click="enabled = !enabled"
        >
          <Power :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="field types-field" :class="{ 'is-disabled': !enabled }">
      <span class="caption">Snap to</span>
      <div class="types">
        <div class="type-row">
          <span class="type-label">Vertex</span>
          <button
            class="power"
            :class="{ 'is-on': vertex }"
            type="button"
            :disabled="!enabled"
            :aria-pressed="vertex"
            aria-label="Snap to vertex"
            v-tooltip="'Snap a corner to a vertex of the level'"
            @click="vertex = !vertex"
          >
            <Power :size="12" aria-hidden="true" />
          </button>
        </div>
        <div class="type-row">
          <span class="type-label">Edge</span>
          <button
            class="power"
            :class="{ 'is-on': edge }"
            type="button"
            :disabled="!enabled"
            :aria-pressed="edge"
            aria-label="Snap to edge"
            v-tooltip="'Rail the edge of the selection on an edge of the level'"
            @click="edge = !edge"
          >
            <Power :size="12" aria-hidden="true" />
          </button>
        </div>
        <div class="type-row">
          <span class="type-label">Face</span>
          <button
            class="power"
            :class="{ 'is-on': plane }"
            type="button"
            :disabled="!enabled"
            :aria-pressed="plane"
            aria-label="Snap to face"
            v-tooltip="'Land a corner on the plane of a face of the level'"
            @click="plane = !plane"
          >
            <Power :size="12" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>

    <div class="field">
      <label class="caption" for="snap-threshold">Threshold</label>
      <div class="row">
        <input
          id="snap-threshold"
          :value="thresholdText"
          class="threshold"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          spellcheck="false"
          aria-label="Snap threshold in pixels"
          v-tooltip="'How far a snap may take the selection, in pixels'"
          @input="onThresholdInput"
          @blur="onThresholdBlur"
          @keydown.up.prevent="stepThreshold(1)"
          @keydown.down.prevent="stepThreshold(-1)"
        />
        <span class="unit">px</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The settings of the edit: the master switch of the snapping, the snaps it runs and the threshold they use. The widget
// is content-sized and has no heading of its own: the dock says its name. The caption sits beside the control, the same
// way the lighting widget does, so a short widget keeps its rows on one line each. The snap types are the power buttons
// of the lighting widget (2026-11-21, the owner), in three rows under the caption.
.EditSettingsWidget {
  display: grid;
  grid-template-columns: max-content;
  justify-content: center;
  align-content: center;
  gap: 4px;
  height: 100%;
  padding: 2px 4px;
  overflow: auto;
  font-size: 13px;

  .field {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }

  .caption {
    flex: none;
    width: 72px;
    color: $text-muted;
    font-size: 10px;
    line-height: 1;
    white-space: nowrap;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  // the three snap types: a column of label and power button rows, the labels on one width so the buttons line up
  .types {
    display: grid;
    gap: 2px;
  }

  .type-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .type-label {
    flex: none;
    width: 40px;
    color: $text;
    line-height: 1;
    white-space: nowrap;
  }

  .types-field.is-disabled .type-label {
    opacity: 0.45;
  }

  // the power switch of the lighting widget: no plate of its own, a faint border and a grey icon while it is off, a
  // lighter border and the accent while it is on, the grey of the panel under the pointer, and the dimmed look while
  // the master switch keeps it disabled
  .power {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: 1px solid $border;
    border-radius: 4px;
    background: transparent;
    color: $text-muted;
    cursor: pointer;

    &:hover {
      background: $surface-panel;
    }

    &:focus-visible {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }

    &.is-on {
      border-color: $border-strong;
      color: $accent;
    }

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }

  .threshold {
    width: 56px;
    padding: 3px 5px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    line-height: 16px;
    text-align: right;

    &:hover {
      border-color: $border;
    }

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }
  }

  .unit {
    color: $text-muted;
    font-size: 11px;
  }
}
</style>
