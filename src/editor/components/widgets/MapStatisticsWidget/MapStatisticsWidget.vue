<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { levelRevision } from '../../../modules/level/editing.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { mapStatisticsRows } from './mapStatistics.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The numbers of the loaded level.
 *
 * @remarks
 * They come from the three files of the level (the FTS holds the polygons, the anchors and the portals, the LLF
 * the lights), so the widget follows the level store: it shows `…` until the level is parsed, then the real counts.
 *
 * The counts of the faces are worked out **once**, when the mesh is built, and an edit changes them in place: the
 * revision of the level is the signal that they moved. It is watched with the selection (the last row counts the
 * faces the walkable view picked) and the map, so a delete and an undo both land on the widget.
 */
const rows = shallowRef(mapStatisticsRows(levelStore.map.value, selectionStore.count.value))

watch(
  [
    (): number | undefined => {
      return levelStore.map.value?.statistics.faceCount
    },
    (): number => {
      return selectionStore.count.value
    },
    (): number => {
      return levelRevision.value
    },
  ],
  () => {
    rows.value = mapStatisticsRows(levelStore.map.value, selectionStore.count.value)
  },
  { immediate: true },
)
</script>

<template>
  <div class="MapStatisticsWidget">
    <WidgetHeading :label="props.label" />
    <dl>
      <template v-for="row in rows" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../infoRows' as *;

.MapStatisticsWidget {
  height: 100%;
  padding: 8px;

  @include info-list;
}
</style>
