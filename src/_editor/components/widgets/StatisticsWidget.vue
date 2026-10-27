<script setup lang="ts">
// placeholder figures: the real numbers come from the loaded level (a later round)
const statistics = [
  ['Polygon count', '12 348'],
  ['Textured polygons', '9 812'],
  ['Light count', '47'],
  ['Anchors', '3'],
  ['Portals', '8'],
] as const
</script>

<template>
  <div class="StatisticsWidget">
    <dl>
      <template v-for="[label, value] in statistics" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
@use '../../palette' as *;

.StatisticsWidget {
  height: 100%;
  padding: 8px;

  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
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
