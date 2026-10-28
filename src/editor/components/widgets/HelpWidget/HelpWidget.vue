<script setup lang="ts">
// the placeholder of the key help: the real list is generated from the hotkey table (a later round)
const hotkeys = [
  ['F2', 'selection debug'],
  ['M', 'toggle the mesh'],
  ['X', 'wireframe'],
  ['J / K / L', 'anchors, portals, lights'],
  ['Escape', 'leave the layout editor'],
] as const
</script>

<template>
  <div class="HelpWidget">
    <dl>
      <template v-for="[key, action] in hotkeys" :key="key">
        <dt>
          <kbd>{{ key }}</kbd>
        </dt>
        <dd>{{ action }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.HelpWidget {
  height: 100%;
  padding: 8px;

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    margin: 0;
    font-size: 13px;
  }

  dd {
    margin: 0;
    color: $text-icon;
  }

  kbd {
    display: inline-block;
    min-width: 18px;
    padding: 0 4px;
    color: $text;
    font-family: inherit;
    font-size: 12px;
    text-align: center;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 3px;
  }
}
</style>
