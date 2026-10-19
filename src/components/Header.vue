<script setup lang="ts">
import downloadIcon from '../assets/download-floppy.png'
import { originalArxLevelIds } from '../constants'
import { currentLevelId, downloadCompleted, downloadProgress, isDirty, isDownloading, isLoading } from '../ui/ui'

defineEmits<{
  (event: 'download'): void
}>()

/** Arx Fatalis does not have a level 9 - the button is an easter egg, it links to a video */
const levelNineId = 9
const levelNineUrl = 'https://www.youtube.com/watch?v=E4WlUXrJgy4'

/** the level buttons in display order (0..8, the easter egg 9, 10..23) */
const levelButtons = [...originalArxLevelIds.slice(0, 9), levelNineId, ...originalArxLevelIds.slice(9)]

/**
 * Loads another level. The level data is fetched and parsed when the module is evaluated, so the
 * switch is a reload: it navigates to `?levelIdx=N` and leaves the camera state (`positionAt`,
 * `angle`) behind, because a coordinate of another level means nothing here. The
 * `?lightingCalculatorMode=` parameter is kept.
 *
 * The download of the edited mesh is still on the TODO list (16), so a "saved" state does not
 * exist yet - if the mesh has been changed, ask before throwing the changes away.
 */
function openLevel(levelId: number): void {
  if (levelId === currentLevelId.value) {
    return
  }

  if (
    isDirty.value &&
    !globalThis.confirm('Nem mentett módosítások vannak a pályán. Ha másik pályát töltesz be, elvesznek. Folytatod?')
  ) {
    return
  }

  const params = new URLSearchParams(globalThis.location.search)
  params.delete('positionAt')
  params.delete('angle')
  params.set('levelIdx', String(levelId))
  params.delete('level')

  globalThis.location.assign(`${globalThis.location.pathname}?${params.toString()}`)
}
</script>

<template>
  <header>
    <span class="brand">Arx Fatalis</span>

    <div class="level-group">
      <span class="level-label">Level</span>
      <nav class="levels" aria-label="Level selector">
        <template v-for="id in levelButtons" :key="id">
          <a
            v-if="id === levelNineId"
            class="level-button"
            :href="levelNineUrl"
            target="_blank"
            rel="noopener noreferrer"
            title="Level 9"
            >9</a
          >
          <button
            v-else
            type="button"
            class="level-button"
            :class="{ active: id === currentLevelId }"
            :disabled="id === currentLevelId"
            :aria-current="id === currentLevelId ? 'true' : undefined"
            :title="`Load level ${id}`"
            @click="openLevel(id)"
          >
            {{ id }}
          </button>
        </template>
      </nav>
    </div>

    <div class="download-area">
      <VTooltip placement="left" :delay="0" :distance="10" :triggers="['hover']">
        <template #popper>Export level</template>

        <button
          class="download-button"
          :disabled="isLoading !== 'fulfilled' || isDownloading"
          aria-label="Export level"
          @click="$emit('download')"
        >
          <img class="download-icon" :src="downloadIcon" alt="" />
        </button>
      </VTooltip>

      <span v-if="isDownloading" class="download-progress">
        <i class="fa-solid fa-spinner fa-spin"></i>
        {{ downloadProgress }}%
      </span>

      <span v-else-if="downloadCompleted" class="download-completed" title="Download complete">
        <i class="fa-solid fa-check"></i>
      </span>
    </div>
  </header>
</template>

<style lang="scss" scoped>
header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #fcf0cf;
  background: #2c2828;
  color: #d3c0c0;

  .brand {
    justify-self: start;
    font-size: 1.5em;
    font-weight: bold;
    white-space: nowrap;
  }

  .level-group {
    display: flex;
    align-items: center;
    justify-self: center;
  }

  .level-label {
    margin-right: 8px;
    white-space: nowrap;
  }

  .download-area {
    display: flex;
    align-items: center;
    justify-self: end;
    gap: 8px;
  }

  .download-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: none;
    line-height: 0;
    cursor: pointer;

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }

  .download-icon {
    width: 30px;
    height: auto;
    /* the icon is pixel art from the game, keep it crisp */
    image-rendering: pixelated;
  }

  .download-button:hover:not(:disabled) .download-icon {
    filter: brightness(1.15);
  }

  .download-button:active:not(:disabled) .download-icon {
    transform: translateY(1px);
  }

  .download-progress {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-size: 12px;
  }

  .download-completed {
    display: inline-flex;
    align-items: center;
    color: #7bd88a;
    font-size: 14px;
  }

  .levels {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .level-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid #1a1717;
    border-radius: 5px;
    background: #4a4444;
    color: #e2d8d8;
    font: inherit;
    font-size: 12px;
    line-height: 1;
    text-decoration: none;
    cursor: pointer;
    box-shadow:
      inset 0 1px 2px rgb(0 0 0 / 60%),
      inset 0 -1px 1px rgb(255 255 255 / 8%),
      0 1px 0 rgb(255 255 255 / 6%);

    &:hover:not(:disabled) {
      background: #595151;
    }

    &:active:not(:disabled) {
      box-shadow: inset 0 2px 4px rgb(0 0 0 / 70%);
    }

    &.active,
    &:disabled {
      border-color: #e5c766;
      background: linear-gradient(#d8b44a, #a9821f);
      color: #2c2828;
      font-weight: bold;
      cursor: default;
      opacity: 1;
      box-shadow:
        0 1px 3px rgb(0 0 0 / 60%),
        0 0 8px rgb(216 180 74 / 45%),
        inset 0 1px 0 rgb(255 255 255 / 45%);
    }
  }
}

/* on narrow screens the centered group does not fit next to the title and the download button */
@media (max-width: 1150px) {
  header {
    display: flex;
    flex-wrap: wrap;

    .brand {
      flex: 1;
    }

    .download-area {
      order: 2;
    }

    .level-group {
      order: 3;
      flex-basis: 100%;
    }
  }
}
</style>
