<script setup lang="ts">
// placeholder values: the real fields come from the camera dialog of the archived app (a later round)
const values = [
  ['Position', '1 234 / −512 / 89'],
  ['Orientation', '12° / 1 890°'],
  ['FOV', '70°'],
] as const
</script>

<template>
  <div class="CameraWidget">
    <dl>
      <template v-for="[label, value] in values" :key="label">
        <dt>{{ label }}</dt>
        <dd>{{ value }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
.CameraWidget {
  height: 100%;
  padding: 8px;

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 13px;
  }

  dt {
    color: #8b929b;
  }

  dd {
    margin: 0;
    color: #e6e6e6;
  }
}
</style>
