<script setup lang="ts">
import { computed } from 'vue'
import { levelStore } from '../../../modules/level/levelStore.ts'
import WidgetHeading from '../WidgetHeading.vue'
import { statisticsRows } from './statistics.ts'

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
 * They come from the three files of the level (the FTS holds the polygons, the anchors and the portals, the
 * LLF the lights), so the widget follows the level store: it shows `…` until the level is parsed, then the
 * real counts.
 */
const rows = computed(() => {
  return statisticsRows(levelStore.map.value)
})
</script>

<template>
  <div class="StatisticsWidget">
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

.StatisticsWidget {
  height: 100%;
  padding: 8px;

  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    margin: 0;
    font-size: 13px;

    @include info-rows;
  }

  dt {
    color: $text-muted;
  }

  dd {
    margin: 0;
    color: $text;
    text-align: right;
  }
}
</style>
