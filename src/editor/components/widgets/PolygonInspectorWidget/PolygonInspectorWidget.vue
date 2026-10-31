<script setup lang="ts">
import { computed } from 'vue'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
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
 */
const rows = computed(() => {
  const map = levelStore.map.value
  const index = crosshairStore.polygon.value

  if (map === undefined || index === undefined) {
    return inspectorRows(undefined)
  }

  const polygon = map.polygons[index]

  if (polygon === undefined) {
    return inspectorRows(undefined)
  }

  return inspectorRows({ index, polygon, textureName: map.textureNameOf(polygon.textureContainerId) })
})
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
@use '../infoRows' as *;

.PolygonInspectorWidget {
  height: 100%;
  padding: 8px;

  @include info-list;
}
</style>
