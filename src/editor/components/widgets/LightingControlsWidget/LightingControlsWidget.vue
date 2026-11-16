<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import {
  flatLuminosity,
  isBakingLighting,
  LIGHTING_PROFILES,
  lightingProfile,
  type LightingProfile,
} from '../../../modules/level/edit/lighting.ts'
import FieldLabel from '../../FieldLabel.vue'

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
 * Whether the slider of the flat light belongs to the widget: only the flat profile draws one grey.
 */
const isFlat = computed<boolean>(() => {
  return lightingProfile.value === 'Flat'
})
</script>

<template>
  <div class="LightingControlsWidget">
    <FieldLabel class="field" label="Lighting Profile" for="lighting-profile">
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
          title="Baking the light"
        />
      </div>
    </FieldLabel>

    <FieldLabel v-if="isFlat" class="field flat-field" label="Luminosity" for="flat-luminosity">
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
        <span class="value">{{ luminosity.toFixed(1) }}</span>
      </div>
    </FieldLabel>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The lighting of the level: the profile of the bake, and the slider of the flat light. The widget is content-sized: it
// wants the height of its rows, and the dock gives it that much when there is room. The widget has no heading of its
// own: the dock says its name. The caption of a field sits above the control, like the fields of the camera form and
// the jump: a word beside the control would take the width its value needs.
.LightingControlsWidget {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  padding: 4px;
  overflow: auto;
  font-size: 13px;

  .field {
    margin: 0;
  }

  .row {
    position: relative;
    display: flex;
    align-items: center;
  }

  // the throbber of the bake: it is out of the layout (absolute, beside the select), so the hidden one does not
  // shift the dropdown off the middle of the widget; only the bake shows it
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
    to {
      transform: rotate(360deg);
    }
  }

  .slider {
    width: 140px;
    margin: 0;
    accent-color: $interactive;
    cursor: pointer;
  }

  .value {
    min-width: 24px;
    color: $text-muted;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  select {
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
