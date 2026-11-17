<script setup lang="ts">
import { ScanSearch, Search, X } from 'lucide-vue-next'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionModeOf } from '../../../modules/selection/selectionStore.ts'
import type { LightMarkerShape } from '../shared/lightMarkers.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import {
  filteredLightRows,
  lightIndexLabelOf,
  lightJumpPoseOf,
  type LightRow,
  lightPositionLabelOf,
  lightRowsOf,
  lightSelectionLabelOf,
  lightShapeLabelOf,
} from './lightInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * What the author typed into the search field.
 */
const query = shallowRef('')

/**
 * The shape the list shows, or `all` for every shape.
 */
const shape = shallowRef<'all' | LightMarkerShape>('all')

/**
 * The search field, so the clear button can put the focus back on it.
 */
const searchField = useTemplateRef<HTMLInputElement>('searchField')

/**
 * The shapes of the filter, in the order the marker draws them.
 */
const shapes: ReadonlyArray<{ value: 'all' | LightMarkerShape; label: string }> = [
  { value: 'all', label: 'All shapes' },
  { value: 'star', label: lightShapeLabelOf('star') },
  { value: 'bulb', label: lightShapeLabelOf('bulb') },
  { value: 'flame', label: lightShapeLabelOf('flame') },
  { value: 'flameCrossed', label: lightShapeLabelOf('flameCrossed') },
]

/**
 * The lights of the level, as the list reads them.
 *
 * @remarks
 * The level and the revision of the lights are the signals of the list: an edit of a light (the colour, the flags, the
 * place) rebuilds the rows the way the markers of the view follow it.
 */
const rows = shallowRef<LightRow[]>([])

watch(
  [
    (): unknown => {
      return levelStore.map.value
    },
    (): number => {
      return lightsRevision.value
    },
  ],
  () => {
    const map = levelStore.map.value

    if (map === undefined) {
      rows.value = []
    } else {
      rows.value = lightRowsOf(map.lights, map.scenePosition)
    }
  },
  { immediate: true },
)

/**
 * The rows the search and the shape filter let through.
 */
const shown = computed(() => {
  return filteredLightRows(rows.value, query.value, shape.value)
})

/**
 * The line above the list: how many lights the level has, and how many are selected.
 */
const selectionLabel = computed(() => {
  return lightSelectionLabelOf(rows.value.length, lightSelectionStore.lights.value.size)
})

/**
 * Picks a light of the list.
 *
 * @remarks
 * A plain click replaces the selection, `Shift` adds to it and `Ctrl` takes away from it, the same reading the faces
 * have: the row and the marker of the walkable view write the same store.
 *
 * @param index The index of the light in `map.lights`.
 * @param event The click of the row.
 */
function pick(index: number, event: MouseEvent): void {
  const mode = selectionModeOf(event)

  // a plain click on the row that is the only pick takes the pick away, the way a row of the rooms does; a click with
  // Shift or Ctrl keeps adding or taking away, so a few lights can be picked together
  if (
    mode === 'replace' &&
    lightSelectionStore.lights.value.size === 1 &&
    lightSelectionStore.lights.value.has(index)
  ) {
    lightSelectionStore.clear()

    return
  }

  lightSelectionStore.selectMany([index], mode)
}

/**
 * Empties the search field, and leaves the focus on it.
 */
function clearSearch(): void {
  query.value = ''
  searchField.value?.focus()
}

/**
 * Selects the whole text of the search field when it takes the focus.
 *
 * @param event The focus of the field.
 */
function selectAllOf(event: FocusEvent): void {
  const field = event.currentTarget

  if (field instanceof HTMLInputElement) {
    field.select()
  }
}

/**
 * Tells whether a light of the list is selected.
 *
 * @param index The index of the light in `map.lights`.
 *
 * @returns True when the selection holds the light.
 */
function isSelected(index: number): boolean {
  return lightSelectionStore.lights.value.has(index)
}

/**
 * Moves the camera to a light, keeping the orientation it has.
 *
 * @remarks
 * The jump also picks the light, so the ring of the walkable view shows what the camera went to. The camera of the
 * view is the only one: the fixed views frame the whole level, and the jump is the walkable view's.
 *
 * @param row The light of the list.
 */
function jumpTo(row: LightRow): void {
  const pose = cameraStore.pose.value

  if (pose === undefined) {
    return
  }

  lightSelectionStore.selectOnly(row.index)
  cameraStore.moveCamera(lightJumpPoseOf(pose, row))
}
</script>

<template>
  <div class="LightInspectorWidget">
    <WidgetHeading :label="props.label" />
    <p class="selection">{{ selectionLabel }}</p>
    <div class="filters">
      <label class="search">
        <Search :size="12" class="icon" />
        <input
          ref="searchField"
          v-model="query"
          type="search"
          placeholder="Search lights"
          aria-label="Search lights"
          @focus="selectAllOf"
        />
        <button
          v-if="query !== ''"
          class="clear"
          type="button"
          aria-label="Empty the search"
          @click.prevent="clearSearch"
        >
          <X :size="12" />
        </button>
      </label>
      <select v-model="shape" class="shape-filter" aria-label="Filter the lights by shape">
        <option v-for="entry in shapes" :key="entry.value" :value="entry.value">{{ entry.label }}</option>
      </select>
    </div>
    <ul class="lights">
      <li
        v-for="row in shown"
        :key="row.index"
        class="light"
        :class="{ 'is-selected': isSelected(row.index) }"
        :title="`${lightShapeLabelOf(row.shape)} · ${lightPositionLabelOf(row.position)}`"
        @click="pick(row.index, $event)"
      >
        <span class="swatch" :style="{ backgroundColor: row.color }"></span>
        <span class="index">{{ lightIndexLabelOf(row.index) }}</span>
        <span class="shape">{{ lightShapeLabelOf(row.shape) }}</span>
        <button
          class="jump"
          type="button"
          :aria-label="`Jump to light ${row.index}`"
          :title="`Jump to light ${row.index}`"
          @click.stop="jumpTo(row)"
        >
          <ScanSearch :size="14" />
        </button>
      </li>
    </ul>
    <p v-if="rows.length > 0 && shown.length === 0" class="empty">No light matches the search</p>
    <p v-else-if="rows.length === 0" class="empty">The level has no lights</p>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The lights of the level: the list scrolls, the search and the filter stay above it.
.LightInspectorWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  min-height: 0;
  padding: 4px 6px;
  color: $text;
  font-size: 12px;

  .selection {
    flex: none;
    margin: 0;
    color: $text-muted;
    font-size: 11px;
  }

  .filters {
    display: flex;
    flex: none;
    gap: 6px;

    .search {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 4px;
      min-width: 0;
      padding: 2px 6px;
      border: 1px solid $border-dark;
      border-radius: 3px;
      background: $surface-panel;

      .icon {
        flex: none;
        color: $text-muted;
      }

      input {
        flex: 1;
        min-width: 0;
        border: 0;
        background: transparent;
        color: $text;
        font: inherit;
        outline: none;
      }

      .clear {
        flex: none;
        padding: 0;
        border: 0;
        background: transparent;
        color: $text-muted;
        cursor: pointer;
      }
    }

    .shape-filter {
      flex: none;
      max-width: 140px;
      border: 1px solid $border-dark;
      border-radius: 3px;
      background: $surface-panel;
      color: $text;
      font: inherit;
    }
  }

  .lights {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0 10px 0 0;
    overflow-y: auto;
    list-style: none;

    .light {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
      border-radius: 3px;
      cursor: pointer;
      user-select: none;

      &:nth-child(even) {
        background: rgba($text-strong, 0.03);
      }

      &:hover {
        background: $surface-panel;
      }

      &.is-selected {
        background: rgba($accent, 0.15);
        color: $text;
      }

      .swatch {
        flex: none;
        width: 10px;
        height: 10px;
        border: 1px solid $border-dark;
        border-radius: 3px;
      }

      .index {
        flex: none;
        width: 58px;
        color: $text-muted;
        font-variant-numeric: tabular-nums;
      }

      .shape {
        flex: 1;
      }

      .jump {
        flex: none;
        padding: 0;
        border: 0;
        background: transparent;
        color: $text-muted;
        cursor: pointer;

        &:hover {
          color: $text-strong;
        }
      }
    }
  }

  .empty {
    flex: none;
    margin: 4px 0 0;
    color: $text-dim;
    font-size: 11px;
  }
}
</style>
