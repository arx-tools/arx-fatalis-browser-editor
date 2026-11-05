<script setup lang="ts">
import { shallowRef, watch } from 'vue'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
import { levelRevision } from '../../../modules/level/editing.ts'
import { levelStore } from '../../../modules/level/levelStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { inspectorRows } from './polygonInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The rows of the face under the crosshair.
 *
 * @remarks
 * The face comes from the walkable view over the crosshair store, and the level from the level store: the two
 * have to meet, because the index alone says nothing without the polygons of the map. An index the level no
 * longer has (an edit moved them) reads as nothing under the crosshair.
 *
 * The **revision** of the level is watched too: an edit changes the polygons under the same index (a delete moves
 * them, an undo puts them back), and the crosshair keeps reporting the same number, so without it the widget would
 * describe the face that was there before the edit.
 */
const rows = shallowRef(inspectorRows(undefined))

watch(
  [
    (): number => {
      return levelRevision.value
    },
    (): number | undefined => {
      return crosshairStore.polygon.value
    },
    (): unknown => {
      return levelStore.map.value
    },
  ],
  () => {
    const map = levelStore.map.value
    const index = crosshairStore.polygon.value

    if (map === undefined || index === undefined) {
      rows.value = inspectorRows(undefined)

      return
    }

    const polygon = map.polygons[index]

    if (polygon === undefined) {
      rows.value = inspectorRows(undefined)

      return
    }

    rows.value = inspectorRows({ index, polygon, textureName: map.textureNameOf(polygon.textureContainerId) })
  },
  { immediate: true },
)
</script>

<template>
  <div class="PolygonInspectorWidget">
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
@use '../shared/infoRows' as *;

.PolygonInspectorWidget {
  height: 100%;
  padding: 8px;

  @include info-list;
}
</style>
