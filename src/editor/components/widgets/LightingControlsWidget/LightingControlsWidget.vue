<script setup lang="ts">
import { LoaderCircle, Power } from 'lucide-vue-next'
import { computed } from 'vue'
import FieldLabel from '../../FieldLabel.vue'
import ToggleButton from '../../ToggleButton.vue'
import { isDynamicLightsVisible, isStaticLightsVisible } from '../../../modules/level/edit/dynamicLights.ts'
import {
  flatLuminosity,
  hasLuminosity,
  isBakingLighting,
  LIGHTING_PROFILES,
  lightingProfile,
  rainbowLuminosity,
  readsPalette,
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
 * Whether the profile on the screen is the `Texture Rainbow` one.
 */
const isRainbow = computed<boolean>(() => {
  return lightingProfile.value === 'TextureRainbow'
})

/**
 * Whether the slider of the light belongs to the widget: the two profiles with a light of their own have one.
 */
const showsLuminosity = computed<boolean>(() => {
  return hasLuminosity(lightingProfile.value)
})

/**
 * Whether the switch of the static lights belongs to the widget.
 *
 * @remarks
 * Only the profiles that read the lights have a baked palette under them: the `Flat` and the `Texture Rainbow` profiles
 * draw a light of their own, and the switch would take away nothing there (2026-11-22, the owner).
 */
const showsStaticSwitch = computed<boolean>(() => {
  return readsPalette(lightingProfile.value)
})

/**
 * The identifier of the slider: one per profile, so the label and the field of the browser name the light they set.
 */
const luminosityFieldId = computed<string>(() => {
  if (isRainbow.value) {
    return 'rainbow-luminosity'
  }

  return 'flat-luminosity'
})

/**
 * The name of the slider, for the assistive technology.
 */
const luminosityLabel = computed<string>(() => {
  if (isRainbow.value) {
    return 'Texture Rainbow luminosity'
  }

  return 'Flat luminosity'
})

/**
 * The light of the profile, bound to the slider.
 *
 * @remarks
 * The two profiles that have a light of their own keep their own value: the grey of the flat one, and the value of the
 * colours of the rainbow one. The slider shows the value of the profile on the screen, and writes that one (2026-11-22,
 * the owner: the rainbow got a slider too).
 */
const luminosity = computed<number>({
  get: (): number => {
    if (isRainbow.value) {
      return rainbowLuminosity.value
    }

    return flatLuminosity.value
  },
  set: (value: number): void => {
    if (isRainbow.value) {
      rainbowLuminosity.value = value

      return
    }

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
    <FieldLabel class="field" inline label="Lighting Profile" for="lighting-profile">
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
    </FieldLabel>

    <FieldLabel v-if="showsLuminosity" class="field flat-field" inline label="Luminosity" :for="luminosityFieldId">
      <div class="row">
        <input
          :id="luminosityFieldId"
          v-model.number="luminosity"
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          :aria-label="luminosityLabel"
        />
        <span class="value">{{ luminosityPercentage }}%</span>
      </div>
    </FieldLabel>

    <FieldLabel v-if="showsStaticSwitch" class="field" inline label="Static lights" for="static-lights">
      <div class="row">
        <ToggleButton
          id="static-lights"
          :pressed="staticLights"
          label="Static lights"
          @update:pressed="staticLights = $event"
        >
          <Power :size="14" aria-hidden="true" />
        </ToggleButton>
      </div>
    </FieldLabel>

    <FieldLabel class="field" inline label="Dynamic lights" for="dynamic-lights">
      <div class="row">
        <ToggleButton
          id="dynamic-lights"
          :pressed="dynamicLights"
          label="Dynamic lights"
          @update:pressed="dynamicLights = $event"
        >
          <Power :size="14" aria-hidden="true" />
        </ToggleButton>
      </div>
    </FieldLabel>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The column of a control: the dropdown and the slider of the light take one width, so a profile change (which shows or
// takes away the slider) does not move the captions and the controls under the hand of the author (2026-11-22, the
// owner). The slider takes what the readout of the percentage leaves.
$control-width: 176px;

// The lighting of the level: the profile of the bake, and the slider of the light. The widget is content-sized: it
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

  .flat-field .row {
    width: $control-width;
  }

  .slider {
    flex: 1;
    min-width: 0;
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
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
    width: $control-width;
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
