<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { computed, reactive, shallowRef, watch } from 'vue'
import { formatCount } from '../../../modules/format.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import {
  entryOfName,
  loadThumbnail,
  textureGroupOfName,
  thumbnailOf,
} from '../../../modules/textures/textureCatalog.ts'
import EmptyMessage from '../../EmptyMessage.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import { selectionSummaryOf, type SelectionSummary } from './selectionInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The numbers of the selection: the faces, and the textures they draw with, grouped by where they come from.
 *
 * @remarks
 * The polygons of a level are a plain list the edits change **in place**, so the selection alone would not tell the
 * widget that a face changed its texture: the summary follows the revision of the level as well (the statistics and the
 * polygon inspector do the same). A selection of indices the level no longer has (an undo moved them) counts the faces it
 * finds.
 *
 * @returns The rows and the groups of the widget.
 */
function summaryOfLevel(): SelectionSummary {
  const map = levelStore.map.value
  const faces = [...selectionStore.polygons.value]

  if (map === undefined) {
    return selectionSummaryOf({
      faces: [],
      polygons: [],
      textureNameOf: () => {
        return undefined
      },
      groupOfName: () => {
        return undefined
      },
    })
  }

  return selectionSummaryOf({
    faces,
    polygons: map.polygons,
    textureNameOf: (textureContainerId) => {
      return map.textureNameOf(textureContainerId)
    },
    groupOfName: (name) => {
      return textureGroupOfName(name)
    },
  })
}

/**
 * The numbers of the selection, as the widget shows them.
 */
const summary = shallowRef(summaryOfLevel())

/**
 * The rows that are open, by their label.
 *
 * @remarks
 * The two rows are accordions: the count opens the rows of the selected faces, the textures row opens the materials of
 * those faces. Both can be open at the same time. The textures start open (the widget used to show them), while the
 * face rows start closed: a room selection can hold thousands of indices, and the list is opt-in for the author.
 */
const openRows = reactive(new Set<string>(['Textures']))

/**
 * The faces of the selection, by their index in the level, in ascending order.
 *
 * @remarks
 * The widget shows the raw indices (the ids the delete, the export and the selection use), not a grouped number: the
 * author compares them with the index of a face. An index the level no longer has is left out, the way the summary
 * counts it.
 */
const selectedFaces = computed<number[]>(() => {
  const map = levelStore.map.value
  const polygons = map?.polygons

  return [...selectionStore.polygons.value]
    .filter((index) => {
      return polygons === undefined || polygons[index] !== undefined
    })
    .toSorted((first, second) => {
      return first - second
    })
})

/**
 * Tells whether a row is open.
 *
 * @param label The caption of the row, like `Selected faces`.
 *
 * @returns True when its content is shown.
 */
function isRowOpen(label: string): boolean {
  return openRows.has(label)
}

/**
 * Opens or closes a row.
 *
 * @param label The caption of the row to open or close.
 */
function toggleRow(label: string): void {
  if (openRows.has(label)) {
    openRows.delete(label)
  } else {
    openRows.add(label)
  }
}

/**
 * Reads the pictures of the textures of the selection.
 *
 * @remarks
 * The tiles of the groups need the pictures of the texture list: it is the same cache, so a texture the list showed is
 * free here, and a texture of a level without a data directory stays a placeholder.
 */
async function loadSelectionThumbnails(): Promise<void> {
  for (const group of summary.value.groups) {
    for (const texture of group.textures) {
      const entry = entryOfName(texture.name)

      if (entry !== undefined) {
        await loadThumbnail(entry)
      }
    }
  }
}

watch(
  [
    (): number => {
      return levelRevision.value
    },
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
    (): unknown => {
      return levelStore.map.value
    },
  ],
  async () => {
    summary.value = summaryOfLevel()
    await loadSelectionThumbnails()
  },
  { immediate: true },
)

/**
 * The thumbnail of a texture of the selection.
 *
 * @param name The name the level calls the texture.
 *
 * @returns The data url of the thumbnail, or `undefined` while the tile shows a placeholder.
 */
function thumbOf(name: string): string | undefined {
  const entry = entryOfName(name)

  if (entry === undefined) {
    return undefined
  }

  return thumbnailOf(entry).value
}
</script>

<template>
  <div class="SelectionInspectorWidget">
    <WidgetHeading :label="props.label" />

    <div class="rows">
      <dl>
        <template v-for="row in summary.rows" :key="row.label">
          <dt
            :class="{ 'is-open': isRowOpen(row.label) }"
            role="button"
            tabindex="0"
            :aria-expanded="isRowOpen(row.label)"
            @click="toggleRow(row.label)"
            @keydown.enter.prevent="toggleRow(row.label)"
            @keydown.space.prevent="toggleRow(row.label)"
          >
            {{ row.label }}
          </dt>
          <dd :class="{ 'is-open': isRowOpen(row.label) }" @click="toggleRow(row.label)">
            <span class="value">{{ row.value }}</span>
            <ChevronDown class="chevron" :class="{ 'is-open': isRowOpen(row.label) }" aria-hidden="true" />
          </dd>

          <div v-if="isRowOpen(row.label)" class="row-content">
            <ul v-if="row.label === 'Selected faces'" class="faces">
              <li v-for="face in selectedFaces" :key="face">{{ face }}</li>
            </ul>

            <div v-else class="groups">
              <section v-for="group in summary.groups" :key="group.source" class="group">
                <h3>
                  <span class="source">{{ group.label }}</span>
                  <span class="count">{{ formatCount(group.faces) }} {{ group.faces === 1 ? 'face' : 'faces' }}</span>
                </h3>
                <ul class="textures">
                  <li v-for="texture in group.textures" :key="texture.name" v-tooltip="texture.name">
                    <img v-if="thumbOf(texture.name) !== undefined" class="thumb" :src="thumbOf(texture.name)" alt="" />
                    <span v-else class="thumb placeholder" aria-hidden="true"></span>
                    <span class="name">{{ texture.name }}</span>
                    <span class="count">{{ formatCount(texture.count) }}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </template>
      </dl>

      <EmptyMessage v-if="summary.count === 0">Nothing is selected.</EmptyMessage>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../shared/infoRows' as *;

// The selection, read as an inspector: the count of the faces and the textures under the title, both as accordions.
// The count opens the ids of the selected faces, the textures row opens the materials they draw with. The widget fills
// the space it is given and scrolls: a selection may hold thousands of faces or forty textures, and the columns of the
// dock must not grow for them.
.SelectionInspectorWidget {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 8px 8px;
  overflow: hidden;

  @include info-list;
}

// the rows and their content: the part that scrolls when the selection is a big one
.rows {
  flex: 1;
  min-height: 0;
  padding-right: 10px;
  overflow-y: auto;
}

dl {
  margin: 0;
}

dt,
dd {
  cursor: pointer;
  user-select: none;

  &:hover {
    background: rgba($text-strong, 0.06);
  }
}

dd {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
}

// the small arrow of a row: down while the content is closed, up while it is open
.chevron {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  color: $text-subtle;
  transition: transform 120ms ease;

  &.is-open {
    transform: rotate(180deg);
  }
}

// the content of an open row: it spans the two columns of the grid, under its row
.row-content {
  grid-column: 1 / -1;
  padding: 2px 6px 6px;
}

.faces {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  padding: 0;
  color: $text;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  list-style: none;

  li {
    padding: 1px 0;
  }
}

.groups {
  padding-top: 2px;
}

.group {
  margin-top: 8px;

  h3 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px;
    margin: 0 0 3px;
    font-size: 10px;
    font-weight: normal;

    .source {
      color: $text-strong;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .count {
      color: $text-subtle;
    }
  }
}

.textures {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .thumb {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 2px;
    object-fit: cover;
  }

  .placeholder {
    border: 1px solid $border-dark;
    background: $surface-panel;
  }

  .name {
    flex: 1;
    overflow: hidden;
    color: $text;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .count {
    flex: 0 0 auto;
    color: $text-muted;
    font-variant-numeric: tabular-nums;
  }
}
</style>
