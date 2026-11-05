<script setup lang="ts">
import { shallowRef, watch } from 'vue'
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

    <dl>
      <template v-for="row in summary.rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>

    <div class="groups">
      <section v-for="group in summary.groups" :key="group.source" class="group">
        <h3>
          <span class="source">{{ group.label }}</span>
          <span class="count">{{ formatCount(group.faces) }} {{ group.faces === 1 ? 'face' : 'faces' }}</span>
        </h3>
        <ul class="textures">
          <li v-for="texture in group.textures" :key="texture.name" :title="texture.name">
            <img v-if="thumbOf(texture.name) !== undefined" class="thumb" :src="thumbOf(texture.name)" alt="" />
            <span v-else class="thumb placeholder" aria-hidden="true"></span>
            <span class="name">{{ texture.name }}</span>
            <span class="count">{{ formatCount(texture.count) }}</span>
          </li>
        </ul>
      </section>

      <p v-if="summary.count === 0" class="empty">Nothing is selected.</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../shared/infoRows' as *;

// The selection, read as an inspector: the count under the title, then the textures of the faces grouped by where they
// come from. The widget fills the space it is given and scrolls: a selection may hold forty textures, and the columns of
// the dock must not grow for them.
.SelectionInspectorWidget {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px;
  overflow: hidden;

  @include info-list;
}

// the groups under the rows: the part that scrolls when the selection is a big one
.groups {
  flex: 1;
  padding: 2px 6px 0;
  overflow-y: auto;
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

.empty {
  margin: 10px 0 0;
  color: $text-dim;
  font-size: 11px;
}
</style>
