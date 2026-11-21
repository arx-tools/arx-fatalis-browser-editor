<script setup lang="ts">
import { computed } from 'vue'
import {
  snapEdgeEnabled,
  snapEnabled,
  snapPlaneEnabled,
  snapThresholdPx,
  snapVertexEnabled,
} from '../shared/snapping.ts'

/**
 * The master switch of the snapping, bound to the checkbox.
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
 * The farthest a snap may take the selection, in pixels of the canvas, bound to the number field.
 *
 * @remarks
 * The stored value is a whole number between 1 and 80: a snap farther than a few tens of pixels is not a snap any more,
 * and the stored form of the setting has to stay one the next build can read (the `deserialize` of the ref checks it
 * too). The field writes on every input, so the drag of the next frame uses the number on the screen.
 */
const threshold = computed<number>({
  get: (): number => {
    return snapThresholdPx.value
  },
  set: (value: number): void => {
    if (!Number.isFinite(value)) {
      return
    }

    snapThresholdPx.value = Math.min(80, Math.max(1, Math.round(value)))
  },
})
</script>

<template>
  <div class="EditSettingsWidget">
    <div class="field">
      <span class="caption">Snapping</span>
      <div class="row">
        <label class="check">
          <input v-model="enabled" type="checkbox" aria-label="Snapping" />
          <span>On</span>
        </label>
      </div>
    </div>

    <div class="field">
      <span class="caption">Snap to</span>
      <div class="row types">
        <label class="check">
          <input v-model="vertex" type="checkbox" aria-label="Snap to vertex" />
          <span>Vertex</span>
        </label>
        <label class="check">
          <input v-model="edge" type="checkbox" aria-label="Snap to edge" />
          <span>Edge</span>
        </label>
        <label class="check">
          <input v-model="plane" type="checkbox" aria-label="Snap to face" />
          <span>Face</span>
        </label>
      </div>
    </div>

    <div class="field">
      <label class="caption" for="snap-threshold">Threshold</label>
      <div class="row">
        <input
          id="snap-threshold"
          v-model.number="threshold"
          class="threshold"
          type="number"
          min="1"
          max="80"
          step="1"
          aria-label="Snap threshold in pixels"
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
// way the lighting widget does, so a short widget keeps its rows on one line each.
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

  .check {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: $text;
    cursor: pointer;
    white-space: nowrap;

    input {
      width: 13px;
      height: 13px;
      margin: 0;
      accent-color: $interactive;
      cursor: pointer;
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
