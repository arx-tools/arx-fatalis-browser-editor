<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import { DEFAULT_MAP_ID, mapNeedingDataDir, openMap, requestedMapId } from '../modules/level/source/maps.ts'
import { isDataDirSetupOpen } from '../modules/level/source/dataDir.ts'

/**
 * The question of a level the editor can not open.
 *
 * @remarks
 * The level of a link may need the folder of the game, and the work of the editor (the inspectors, the statistics, the
 * textures) starts from a level: an empty dock under a map that never arrives is no use to anyone. So the question is
 * over the **whole editor**, not over the walkable view, and it is answered before anything else starts (2026-11-12, the
 * owner). The cover keeps the clicks away from the dock: the answer is the only way on.
 */
const text = computed(() => {
  const missing = mapNeedingDataDir.value

  if (missing === undefined) {
    return ''
  }

  if (missing.hasChanges) {
    return `Found unsaved changes on the previously edited level ${missing.name}, which needs the Arx data dir to be reconnected. Your edits are kept safe regardless of this.`
  }

  return 'The link you are trying to open refers to a map that requires the Arx data dir to be set.'
})

/**
 * The label of the button that connects the folder.
 */
const connectLabel = computed(() => {
  if (mapNeedingDataDir.value?.hasChanges === true) {
    return 'Reconnect now and load level'
  }

  return 'Connect data dir and load level'
})

/**
 * The label of the button that starts a blank level instead.
 */
const laterLabel = computed(() => {
  if (mapNeedingDataDir.value?.hasChanges === true) {
    return 'Reconnect later and start a blank map'
  }

  return 'Connect later and start a blank map'
})

/**
 * Opens the setup dialog of the folder, and leaves the question up until the folder answers it.
 */
function connect(): void {
  isDataDirSetupOpen.value = true
}

/**
 * Puts the question away and starts a blank level.
 *
 * @remarks
 * The blank level starts at its own spawn: the pose of the url belongs to the level of the link, and the camera of that
 * level would land the author at a place that means nothing on a plane (`openMap` without `camera` goes to the spawn).
 */
function startBlank(): void {
  mapNeedingDataDir.value = undefined
  requestedMapId.value = undefined
  openMap(DEFAULT_MAP_ID).catch(() => {
    // the store keeps the error of the load, the walkable view shows it
  })
}
</script>

<template>
  <Teleport to="body">
    <div v-if="mapNeedingDataDir !== undefined" class="MissingMapPrompt">
      <div class="cover" />
      <div class="panel" role="dialog" aria-modal="true" aria-label="The Arx data dir of the map of this link">
        <!-- the sentence in the amber of a warning: the map of the link is not there, and the folder is what is missing -->
        <p class="notice-text">
          <TriangleAlert :size="14" />
          <span>{{ text }}</span>
        </p>
        <div class="notice-actions">
          <button class="notice-button" type="button" @click="connect">{{ connectLabel }}</button>
          <button class="notice-dismiss" type="button" @click="startBlank">{{ laterLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.MissingMapPrompt {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  // the cover is under the panel and over everything else: the dock waits for the answer
  .cover {
    position: absolute;
    inset: 0;
    background: $ink;
    opacity: 0.45;
  }

  .panel {
    position: relative;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    // 570px in all, the sentence of a link on one line and a panel that does not spread over the dock
    width: min(570px, 92vw);
    padding: 14px 16px;
    color: $text;
    background: $surface-float;
    border: 1px solid $border-dark;
    border-radius: 6px;
    box-shadow: 0 8px 30px $ink;
    font-size: 13px;
    line-height: 1.45;
  }

  .notice-text {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 7px 10px;
    color: $accent;
    background: rgba($accent, 0.1);
    border: 1px solid rgba($accent, 0.3);
    border-radius: 4px;

    svg {
      flex: none;
    }
  }

  // the buttons sit in the middle of the panel, under the sentence they answer
  .notice-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .notice-button {
    padding: 5px 12px;
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

  // the second way out: quiet, because it is the one that keeps the editor without a level
  .notice-dismiss {
    padding: 5px 12px;
    color: $text-muted;
    font: inherit;
    background: none;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      color: $text;
      background: $surface-panel;
    }
  }
}
</style>
