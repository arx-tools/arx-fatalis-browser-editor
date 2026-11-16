<script setup lang="ts">
import { LoaderCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import {
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
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The lighting of the level: the profile of the bake. The widget is content-sized: it wants the height of its row, and
// the dock gives it that much when there is room. The widget has no heading of its own: the dock says its name. The
// caption of the field sits above the select, like the fields of the camera form and the jump: a word beside the
// control would take the width its value needs.
.LightingControlsWidget {
  display: flex;
  height: 100%;
  padding: 4px;
  overflow: auto;
  font-size: 13px;

  // centred both ways, like the jump: the `margin` with `auto` centres the caption and the select when there is free
  // space, and falls back to the top left when the widget is too small for them
  .field {
    margin: auto;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  // the throbber of the bake: it keeps its place beside the select, and only shows itself while the palette is computed
  .spin {
    flex: none;
    color: $interactive;
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
