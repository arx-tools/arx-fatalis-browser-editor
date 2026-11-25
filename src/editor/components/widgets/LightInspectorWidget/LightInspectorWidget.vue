<script setup lang="ts">
import { ScanSearch } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { lightsRevision } from '../../../modules/level/edit/lightEditing.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionModeOf, selectionStore } from '../../../modules/selection/selectionStore.ts'
import type { LightMarkerShape } from '../shared/lightMarkers.ts'
import { createRevealGate, revealRowIn } from '../shared/revealRow.ts'
import AccordionRow from '../../AccordionRow.vue'
import ColorSwatch from '../../ColorSwatch.vue'
import InspectorRow from '../../InspectorRow.vue'
import EmptyMessage from '../../EmptyMessage.vue'
import SearchField from '../../SearchField.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import {
  filteredLightRows,
  LIGHT_HEADER_HEIGHT_FALLBACK,
  LIGHT_ROW_HEIGHT_FALLBACK,
  lightIndexLabelOf,
  lightJumpPoseOf,
  lightPositionLabelOf,
  lightRowWindowOf,
  lightRowsOf,
  lightSectionTopsOf,
  lightSectionsOf,
  lightShapeLabelOf,
  revealScrollTopOf,
  type LightListMetrics,
  type LightRow,
  type LightRowWindow,
  type LightSection,
  type LightSectionRows,
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
 * The level and the revision of the lights are the signals of the list: an edit of a light (the color, the flags, the
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
 * The sections whose rows are on the screen.
 *
 * @remarks
 * Both sections start **open**: the list is the whole of the lights, and a closed section would hide the half of the
 * level the author opened the widget for (2026-11-24, the owner). The headers stay after a fold, so a section is a click
 * away again.
 */
const openSections = reactive(new Set<LightSection>(['static', 'dynamic']))

/**
 * Tells whether the rows of a section are shown.
 *
 * @param section The section to read.
 *
 * @returns True while the section is open.
 */
function isSectionOpen(section: LightSection): boolean {
  return openSections.has(section)
}

/**
 * Opens or closes the rows of a section.
 *
 * @param section The section to flip.
 */
function toggleSection(section: LightSection): void {
  if (openSections.has(section)) {
    openSections.delete(section)

    return
  }

  openSections.add(section)
}

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
 * The height of a light row, in css pixels.
 *
 * @remarks
 * The rows are one line of the same font, so they share their height; the list measures the first one when it is on the
 * screen, and the fallback is the height before that (and in a box that has no size yet).
 */
const rowHeight = shallowRef(LIGHT_ROW_HEIGHT_FALLBACK)

/**
 * The height of a section header, in css pixels.
 */
const headerHeight = shallowRef(LIGHT_HEADER_HEIGHT_FALLBACK)

/**
 * The sections of the list: the static lights and the dynamic ones, each with the rows the filter lets through.
 */
const sections = computed(() => {
  return lightSectionsOf(shown.value)
})

/**
 * The heights of the list, as the box measured them.
 */
const metrics = computed<LightListMetrics>(() => {
  return { rowHeight: rowHeight.value, headerHeight: headerHeight.value }
})

/**
 * The top of the header of every section, in css pixels, from the top of the list.
 */
const sectionTops = computed(() => {
  return lightSectionTopsOf(sections.value, metrics.value, isSectionOpen)
})

/**
 * What the list draws of a section: its header, the window of its rows, and the rows the window holds.
 */
type LightSectionView = {
  /**
   * The section and its rows.
   */
  readonly section: LightSectionRows
  /**
   * Whether the rows of the section are in the flow of the list.
   */
  readonly open: boolean
  /**
   * The window of the rows.
   */
  readonly window: LightRowWindow
  /**
   * The rows the window draws.
   */
  readonly visible: readonly LightRow[]
}

/**
 * The sections as the list draws them.
 */
const views = computed<LightSectionView[]>(() => {
  return sections.value.map((section) => {
    // the header sticks to the top of the box, so the window of the rows is read from the scroll the rows of the section
    // have: the headers and the sections above are taken away from the scroll of the box
    const rowsTop = sectionTops.value[section.section] + headerHeight.value
    const window = lightRowWindowOf(
      section.rows.length,
      scrollTop.value - rowsTop,
      viewportHeight.value,
      rowHeight.value,
    )

    return {
      section,
      open: isSectionOpen(section.section),
      window,
      visible: section.rows.slice(window.start, window.end),
    }
  })
})

/**
 * How many lights are picked: the line above the list, which the list shows only when there is one.
 */
const selectedCount = computed(() => {
  return lightSelectionStore.lights.value.size
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
 * Reads the height of the scroll box, of a row and of a section header.
 *
 * @remarks
 * The row and the header are measured and not guessed: a font the editor changes on the screen, or a browser that rounds
 * the line differently, would move the window off the entries otherwise. The box has no size while the widget is
 * detached (a layout builds it before the dock takes it), so the observer reads them when it is on the screen.
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

  const row = element.querySelector<HTMLElement>(':scope .light')
  const height = row?.getBoundingClientRect().height ?? 0

  if (height > 0) {
    rowHeight.value = height
  }

  const header = element.querySelector<HTMLElement>(':scope .section-head .head')
  const headerBox = header?.getBoundingClientRect().height ?? 0

  if (headerBox > 0) {
    headerHeight.value = headerBox
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

/**
 * The reveal that is being worked out, so a selection that moves on takes the last one away.
 */
let revealToken = 0

/**
 * The gate of the reveal: a click in this list does not move it.
 */
const revealGate = createRevealGate()

/**
 * How many frames a reveal follows the box for.
 *
 * @remarks
 * The dock gives a widget its size after the widget is attached: the first nudge reads the box of the moment, and the
 * passes after it read the box the author has.
 */
const REVEAL_PASSES = 3

/**
 * The frame that waits for the list to draw the window of the row the reveal went to.
 *
 * @returns A promise that resolves on the next frame.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

/**
 * Reads the row of a light the window of the list drew.
 *
 * @param index The index of the light in `map.lights`.
 *
 * @returns The row of the light, or `null` while the window is not on the screen.
 */
function lightRowElementOf(index: number): HTMLElement | null {
  const element = list.value

  if (element === null) {
    return null
  }

  for (const row of element.querySelectorAll<HTMLElement>(':scope [data-light-index]')) {
    if (row.dataset.lightIndex === String(index)) {
      return row
    }
  }

  return null
}

/**
 * Puts the picked light on the screen: opens its section, clears the filter that hides it, and scrolls to its row.
 *
 * @remarks
 * The owner asked for a selection to find its list (2026-11-24): a light picked in the walkable view is on the screen of
 * the inspector, with the section of its kind open. The reveal runs on **one** light only: a few lights together have no
 * row to go to. A search or a shape filter that hides the light is cleared, because the author picked a light to see it,
 * and the list scrolls once, without an animation; a row that is already in the box stays where it is.
 */
async function revealSelected(): Promise<void> {
  const token = revealToken + 1

  revealToken = token

  const selection = [...lightSelectionStore.lights.value]

  if (selection.length !== 1) {
    return
  }

  const index = selection[0]
  const row = rows.value.find((candidate) => {
    return candidate.index === index
  })

  if (row === undefined) {
    return
  }

  const hidden = shown.value.every((candidate) => {
    return candidate.index !== index
  })

  if (hidden) {
    query.value = ''
    shape.value = 'all'
  }

  openSections.add(row.section)

  // the filter and the fold are written on the state, the list is drawn from it on the next tick
  await nextTick()

  const element = list.value

  if (token !== revealToken || element === null) {
    return
  }

  const section = sections.value.find((candidate) => {
    return candidate.section === row.section
  })

  if (section === undefined) {
    return
  }

  const position = section.rows.findIndex((candidate) => {
    return candidate.index === index
  })

  if (position === -1) {
    return
  }

  measureList()

  const sectionTop = sectionTops.value[row.section] + headerHeight.value
  const offset = position * rowHeight.value
  const top = sectionTop + offset
  const target = revealScrollTopOf(top, rowHeight.value, element.scrollTop, viewportHeight.value)

  element.scrollTop = target
  scrollTop.value = target

  // the window of the list draws the row on the next frame, and the measured nudge takes the rounding of a fractional
  // row height off the edge of the box (the last line of the row stayed a pixel under it in firefox). The nudge keeps the
  // row under the sticky header of its section; the frames after the first one read the box the dock has laid out.
  for (let pass = 0; pass < REVEAL_PASSES; pass++) {
    await nextFrame()

    if (token !== revealToken) {
      return
    }

    revealRowIn(list.value, lightRowElementOf(index), headerHeight.value)
    scrollTop.value = list.value?.scrollTop ?? scrollTop.value
  }
}

onMounted(() => {
  scheduleMeasure()

  if (list.value !== null) {
    resizeObserver = new ResizeObserver(() => {
      scheduleMeasure()
    })
    resizeObserver.observe(list.value)
  }

  // a widget that arrives with a light picked (a preset switch, a drag into the dock) shows the light: the dock builds
  // the widget before it lays it out, so the reveal waits a frame for the box
  requestAnimationFrame(() => {
    revealSelected().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined

  if (measureFrame !== undefined) {
    cancelAnimationFrame(measureFrame)
    measureFrame = undefined
  }
})

// a new search or shape starts the list at its top, or the window would sit on an entry the filter may have taken away
watch([query, shape], () => {
  scrollTop.value = 0

  if (list.value !== null) {
    list.value.scrollTop = 0
  }
})

// a pick of the walkable view, a row of the selection inspector, and a click in this list all write the same store
watch(
  () => {
    return lightSelectionStore.lights.value
  },
  () => {
    if (revealGate.take()) {
      return
    }

    revealSelected().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  },
)

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

  revealGate.suppress()

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

  revealGate.suppress()
  lightSelectionStore.selectOnly(row.index)
  cameraStore.moveCamera(lightJumpPoseOf(pose, row))
}
</script>

<template>
  <div class="LightInspectorWidget">
    <WidgetHeading :label="props.label">
      <template #actions>
        <span class="total">Total: {{ rows.length }}</span>
      </template>
    </WidgetHeading>
    <p v-if="selectedCount > 0" class="selection">{{ selectedCount }} selected</p>
    <div class="filters">
      <SearchField v-model="query" placeholder="Search lights" label="Search lights" />
      <select v-model="shape" class="shape-filter" aria-label="Filter the lights by shape">
        <option v-for="entry in shapes" :key="entry.value" :value="entry.value">{{ entry.label }}</option>
      </select>
    </div>
    <ul ref="list" class="lights" @scroll.passive="handleScroll">
      <template v-for="view in views" :key="view.section.section">
        <li class="section-head">
          <AccordionRow
            :label="view.section.label"
            :value="String(view.section.rows.length)"
            :empty="view.section.rows.length === 0"
            :open="view.open"
            @toggle="toggleSection(view.section.section)"
          />
        </li>
        <template v-if="view.open">
          <li
            v-if="view.window.top > 0"
            class="spacer"
            :style="{ height: `${view.window.top}px` }"
            aria-hidden="true"
          />
          <InspectorRow
            v-for="row in view.visible"
            :key="row.index"
            class="light"
            :class="{ 'is-selected': isSelected(row.index), 'is-striped': row.index % 2 === 1 }"
            :data-light-index="row.index"
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
              <ScanSearch :size="13" />
            </button>
          </InspectorRow>
          <li
            v-if="view.window.bottom > 0"
            class="spacer"
            :style="{ height: `${view.window.bottom}px` }"
            aria-hidden="true"
          />
        </template>
      </template>
    </ul>
    <EmptyMessage v-if="rows.length > 0 && shown.length === 0">No light matches the search.</EmptyMessage>
    <EmptyMessage v-else-if="rows.length === 0">The level has no lights.</EmptyMessage>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The lights of the level: the list scrolls, the search and the filter stay above it. The static and the dynamic lights
// are two sections of the one list, each with its window of rows: the headers stay at the top of the box while the rows
// of their section scroll under them (2026-11-25, the owner).
.LightInspectorWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  min-height: 0;
  padding: 0 8px 8px;
  color: $text;
  font-size: 12px;

  // the count of the level sits in the heading, on the right, the way the entity list keeps its total
  .total {
    color: $text-muted;
    font-size: 11px;
  }

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

    // the room of the rows that are not drawn: an `<li>` and not a padding, because the padding of the scroll box
    // would be the box's own size (the list would grow to it in the moment the pass lets the content measure itself)
    .spacer {
      padding: 0;
      margin: 0;
      border: 0;
      list-style: none;
    }

    // the header of a section: the shared accordion row, with an empty fold (the rows of the section follow it in the
    // flow), so the empty content of the row takes no room. It sticks to the top of the box while the rows of the section
    // scroll under it; the box of the list is the widget's surface, so the header paints over the rows with the same
    // color, or they would show through it
    .section-head {
      position: sticky;
      top: 0;
      z-index: 1;
      margin: 0;
      padding: 0;
      background: $surface-app;
      list-style: none;

      :deep(.content) {
        display: none;
      }
    }

    .light {
      padding: 3px 6px;
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
