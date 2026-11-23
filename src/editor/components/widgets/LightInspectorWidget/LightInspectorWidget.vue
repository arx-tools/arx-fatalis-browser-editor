<script setup lang="ts">
import { ScanSearch } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionModeOf, selectionStore } from '../../../modules/selection/selectionStore.ts'
import type { LightMarkerShape } from '../shared/lightMarkers.ts'
import ColorSwatch from '../../ColorSwatch.vue'
import InspectorRow from '../../InspectorRow.vue'
import EmptyMessage from '../../EmptyMessage.vue'
import SearchField from '../../SearchField.vue'
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
  lightWindowOf,
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
 * The height of a row of the list, before the browser has measured one.
 */
const ROW_HEIGHT_FALLBACK = 25

/**
 * The scroll box of the list.
 */
const list = useTemplateRef<HTMLUListElement>('list')

/**
 * How far the list is scrolled, in css pixels.
 */
const scrollTop = shallowRef(0)

/**
 * The height of the scroll box, in css pixels.
 */
const viewportHeight = shallowRef(0)

/**
 * The height of a row, in css pixels.
 *
 * @remarks
 * The rows are one line of the same font, so they share their height; the list measures the first one when it is on the
 * screen, and {@link ROW_HEIGHT_FALLBACK} is the height before that (and in a box that has no size yet).
 */
const rowHeight = shallowRef(ROW_HEIGHT_FALLBACK)

/**
 * The window of the rows the list draws.
 */
const listWindow = computed(() => {
  return lightWindowOf(shown.value.length, scrollTop.value, viewportHeight.value, rowHeight.value)
})

/**
 * The rows the window draws.
 */
const visibleRows = computed<readonly LightRow[]>(() => {
  return shown.value.slice(listWindow.value.start, listWindow.value.end)
})

/**
 * The line above the list: how many lights the level has, and how many are selected.
 */
const selectionLabel = computed(() => {
  return lightSelectionLabelOf(rows.value.length, lightSelectionStore.lights.value.size)
})

/**
 * Reads the scroll position of the list.
 */
function handleScroll(): void {
  const element = list.value

  if (element === null) {
    return
  }

  scrollTop.value = element.scrollTop
}

/**
 * Reads the height of the scroll box and of a row.
 *
 * @remarks
 * The row is measured and not guessed: a font the editor changes on the screen, or a browser that rounds the line
 * differently, would move the window off the rows otherwise. The box has no size while the widget is detached (a
 * layout builds it before the dock takes it), so the observer reads both when it is on the screen.
 */
function measureList(): void {
  const element = list.value

  if (element === null) {
    return
  }

  // the pass may let the content of the widget grow for a moment (see `scheduleMeasure`): the node of the widget keeps
  // the size the dock gave it, and the list can never be taller than that
  const owner = element.closest<HTMLElement>('.lm-DockPanel-widget')
  const limit = owner?.clientHeight ?? element.clientHeight

  viewportHeight.value = Math.min(element.clientHeight, limit)

  const row = element.querySelector<HTMLElement>('.light')
  const height = row?.getBoundingClientRect().height ?? 0

  if (height > 0) {
    rowHeight.value = height
  }
}

/**
 * The observer of the size of the scroll box (a dock column that is resized).
 */
let resizeObserver: ResizeObserver | undefined

/**
 * The frame the next measurement waits for, or `undefined` when none is asked for.
 */
let measureFrame: number | undefined

/**
 * Measures the scroll box after the layout has settled.
 *
 * @remarks
 * The pass of the sizes measures the content of a content-sized widget by letting it grow for a moment
 * (`contentHeightOf`), and the observer sees that size: the list is a scroll box whose content is the whole list, so a
 * measurement of the instant the widget is let go reads the height of the content as the viewport. The two frames below
 * skip that moment; the box is at its final size on the second one.
 */
function scheduleMeasure(): void {
  if (measureFrame !== undefined) {
    cancelAnimationFrame(measureFrame)
  }

  measureFrame = requestAnimationFrame(() => {
    measureFrame = requestAnimationFrame(() => {
      measureFrame = undefined
      measureList()
    })
  })
}

onMounted(() => {
  scheduleMeasure()

  if (list.value !== null) {
    resizeObserver = new ResizeObserver(() => {
      scheduleMeasure()
    })
    resizeObserver.observe(list.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined

  if (measureFrame !== undefined) {
    cancelAnimationFrame(measureFrame)
    measureFrame = undefined
  }
})

// a new search or shape starts the list at its top, or the window would sit on a row the filter may have taken away
watch([query, shape], () => {
  scrollTop.value = 0

  if (list.value !== null) {
    list.value.scrollTop = 0
  }
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
    selectionStore.clear()

    return
  }

  // a plain click is a new selection: the faces of the other kind go with it (the two stores are still separate; the
  // unified selection is the 254)
  if (mode === 'replace') {
    selectionStore.clear()
  }

  lightSelectionStore.selectMany([index], mode)
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
      <SearchField v-model="query" placeholder="Search lights" label="Search lights" />
      <select v-model="shape" class="shape-filter" aria-label="Filter the lights by shape">
        <option v-for="entry in shapes" :key="entry.value" :value="entry.value">{{ entry.label }}</option>
      </select>
    </div>
    <ul ref="list" class="lights" @scroll.passive="handleScroll">
      <li v-if="listWindow.top > 0" class="spacer" :style="{ height: `${listWindow.top}px` }" aria-hidden="true" />
      <InspectorRow
        v-for="row in visibleRows"
        :key="row.index"
        class="light"
        :class="{ 'is-selected': isSelected(row.index), 'is-striped': row.index % 2 === 1 }"
        @click="pick(row.index, $event)"
      >
        <ColorSwatch :color="row.color" :radius="3" border="line" />
        <span class="index">{{ lightIndexLabelOf(row.index) }}</span>
        <span class="shape" v-tooltip="`${lightShapeLabelOf(row.shape)} · ${lightPositionLabelOf(row.position)}`">
          {{ lightShapeLabelOf(row.shape) }}
        </span>
        <button
          class="jump"
          type="button"
          :aria-label="`Jump to light ${row.index}`"
          v-tooltip="`Jump to light ${row.index}`"
          @click.stop="jumpTo(row)"
        >
          <ScanSearch :size="14" />
        </button>
      </InspectorRow>
      <li
        v-if="listWindow.bottom > 0"
        class="spacer"
        :style="{ height: `${listWindow.bottom}px` }"
        aria-hidden="true"
      />
    </ul>
    <EmptyMessage v-if="rows.length > 0 && shown.length === 0">No light matches the search</EmptyMessage>
    <EmptyMessage v-else-if="rows.length === 0">The level has no lights</EmptyMessage>
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
  padding: 0 8px 8px;
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

    // the field takes the room the shape filter leaves
    .SearchField {
      flex: 1;
      min-width: 0;
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
    // the search row keeps a breath before the list (2026-11-22, the owner: the rows touched the field)
    margin: 20px 0 0;
    padding: 0 10px 0 0;
    overflow-y: auto;
    list-style: none;

    // the room of the rows that are not drawn: a `<li>` and not a padding, because the padding of the scroll box would
    // be the box's own size (the list would grow to it in the moment the pass lets the content measure itself)
    .spacer {
      padding: 0;
      margin: 0;
      border: 0;
      list-style: none;
    }

    .light {
      padding: 4px 6px;
      border-radius: 3px;
      background: transparent;
      user-select: none;

      // the stripe follows the light, not the place of the row in the window: the window moves while the list scrolls,
      // so the nth-child of the shared row would crawl
      &.is-striped {
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
}
</style>
