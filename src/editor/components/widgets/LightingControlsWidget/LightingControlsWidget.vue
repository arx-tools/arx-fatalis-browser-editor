<script setup lang="ts">
import { LoaderCircle, Power } from 'lucide-vue-next'
import { computed } from 'vue'
import { isDynamicLightsVisible, isStaticLightsVisible } from '../../../modules/level/edit/dynamicLights.ts'
import {
  flatLuminosity,
  isBakingLighting,
  LIGHTING_PROFILES,
  lightingProfile,
  type LightingProfile,
} from '../../../modules/level/edit/lighting.ts'

/**
 * The profile of the lighting, bound to the select of the widget.
 *
 * @remarks
 * The store holds the profile, and its watches bake the palette of the level when the profile changes or a level
 * arrives: picking one is the bake, and a new map starts with the light of the profile.
 */
const profile = computed<LightingProfile>({
  get: (): LightingProfile => {
    return lightingProfile.value
  },
  set: (value: LightingProfile): void => {
    lightingProfile.value = value
  },
})

/**
 * The light of the flat profile, bound to the slider.
 */
const luminosity = computed<number>({
  get: (): number => {
    return flatLuminosity.value
  },
  set: (value: number): void => {
    flatLuminosity.value = value
  },
})

/**
 * The light of the flat profile as a whole percent, the readout of the slider.
 *
 * @remarks
 * The range is 0..1 in steps of 0.1, so every step is a whole percent: 0 is black, 0.7 is 70, 1 is the brightest. The
 * product is rounded because the binary fractions of the slider do not multiply cleanly (0.7 * 100 is 70.00000000000001).
 */
const luminosityPercentage = computed<number>(() => {
  return Math.round(luminosity.value * 100)
})

/**
 * Whether the slider of the flat light belongs to the widget: only the flat profile draws one grey.
 */
const isFlat = computed<boolean>(() => {
  return lightingProfile.value === 'Flat'
})

/**
 * The static light of the level, bound to the checkbox.
 *
 * @remarks
 * The palette of the level is the static light the game baked; the switch takes it away, so the level is dark and only
 * the dynamic layer lights it. It is a view preference of the author, kept in the browser like the profile.
 */
const staticLights = computed<boolean>({
  get: (): boolean => {
    return isStaticLightsVisible.value
  },
  set: (value: boolean): void => {
    isStaticLightsVisible.value = value
  },
})

/**
 * The dynamic light layer of the level, bound to the checkbox.
 *
 * @remarks
 * The layer draws the semi-dynamic lights of the level on top of the baked palette (the torches and the candles, with
 * their flicker): it is the look of the game, and a view preference of the author, kept in the browser like the profile.
 */
const dynamicLights = computed<boolean>({
  get: (): boolean => {
    return isDynamicLightsVisible.value
  },
  set: (value: boolean): void => {
    isDynamicLightsVisible.value = value
  },
})
</script>

<template>
  <div class="LightingControlsWidget">
    <div class="field">
      <label class="caption" for="lighting-profile">Lighting Profile</label>
      <div class="row">
        <select id="lighting-profile" v-model="profile" aria-label="Lighting profile">
          <option v-for="option in LIGHTING_PROFILES" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <LoaderCircle
          class="spin"
          :class="{ 'is-baking': isBakingLighting }"
          :size="14"
          aria-hidden="true"
          v-tooltip="'Baking the light'"
        />
      </div>
    </div>

    <div v-if="isFlat" class="field flat-field">
      <label class="caption" for="flat-luminosity">Luminosity</label>
      <div class="row">
        <input
          id="flat-luminosity"
          v-model.number="luminosity"
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          aria-label="Flat luminosity"
        />
        <span class="value">{{ luminosityPercentage }}%</span>
      </div>
    </div>

    <div class="field">
      <label class="caption" for="static-lights">Static lights</label>
      <div class="row">
        <button
          id="static-lights"
          class="power"
          :class="{ 'is-on': staticLights }"
          type="button"
          :aria-pressed="staticLights"
          aria-label="Static lights"
          v-tooltip="'Static lights'"
          @click="staticLights = !staticLights"
        >
          <Power :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="field">
      <label class="caption" for="dynamic-lights">Dynamic lights</label>
      <div class="row">
        <button
          id="dynamic-lights"
          class="power"
          :class="{ 'is-on': dynamicLights }"
          type="button"
          :aria-pressed="dynamicLights"
          aria-label="Dynamic lights"
          v-tooltip="'Dynamic lights'"
          @click="dynamicLights = !dynamicLights"
        >
          <Power :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The lighting of the level: the profile of the bake, and the slider of the flat light. The widget is content-sized: it
// wants the height of its rows, and the dock gives it that much when there is room. The widget has no heading of its
// own: the dock says its name. The caption sits **beside** the control (2026-11-18): the Lighter preset gives the
// widget 350 by 60, and the caption above the control took the top of the widget away, so the two rows are one line
// each, the captions on a fixed column, and the controls start at the same place. The two fields are one column of a
// grid, so both take the width of the widest row.
.LightingControlsWidget {
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
    position: relative;
    display: flex;
    align-items: center;
  }

  // the throbber of the bake: it is out of the layout (absolute, beside the select), so the hidden one does not
  // shift the dropdown off the middle of the widget; only the bake shows it. The translate of the transform holds the
  // mark in the middle of the row, so the turn has to keep it: a keyframe that writes only the rotation would take it
  // away, and the mark would slide down while it should spin.
  .spin {
    position: absolute;
    top: 50%;
    right: -20px;
    color: $interactive;
    transform: translateY(-50%);
    visibility: hidden;

    &.is-baking {
      visibility: visible;
      animation: spin 900ms linear infinite;
    }
  }

  @keyframes spin {
    from {
      transform: translateY(-50%) rotate(0deg);
    }

    to {
      transform: translateY(-50%) rotate(1turn);
    }
  }

  .slider {
    width: 140px;
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
  }

  // the switch of a light layer: a power icon like the icon buttons of the header (2026-11-18, the owner): no plate of
  // its own, the dark background of the panel shows through; a faint border and a grey icon while the layer is off, a
  // lighter border and the accent while it is on, and the grey of the panel under the pointer.
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
  }

  // the readout of the slider: it shares the row with the range, so its field has one width for every value (0% is
  // narrower than 100%), otherwise the slider would move under the hand of the author while the light is dragged
  .value {
    flex: none;
    width: 36px;
    color: $text-muted;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  select {
    width: 100%;
    min-width: 160px;
    padding: 3px 5px;
    border: 1px solid $border-dark;
    border-radius: 4px;
    background: $surface-panel;
    color: $text;
    font: inherit;
    line-height: 16px;
    cursor: pointer;

    &:hover {
      border-color: $border;
    }

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }
  }
}
</style>
