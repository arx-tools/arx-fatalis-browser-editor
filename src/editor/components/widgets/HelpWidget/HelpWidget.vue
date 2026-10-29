<script setup lang="ts">
import WidgetHeading from '../../WidgetHeading.vue'

// the placeholder of the key help: the real list is generated from the hotkey table (a later round)
const hotkeys = [
  { keys: ['F2'], action: 'Selection debug' },
  { keys: ['M'], action: 'Toggle the mesh' },
  { keys: ['X'], action: 'Wireframe' },
  { keys: ['J', 'K', 'L'], action: 'Anchors, portals, lights' },
  { keys: ['Escape'], action: 'Leave the layout editor' },
] as const

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()
</script>

<template>
  <div class="HelpWidget">
    <WidgetHeading :label="props.label" />
    <dl>
      <template v-for="hotkey in hotkeys" :key="hotkey.action">
        <dt>
          <kbd v-for="key in hotkey.keys" :key="key">{{ key }}</kbd>
        </dt>
        <dd>{{ hotkey.action }}</dd>
      </template>
    </dl>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;
@use '../infoRows' as *;

.HelpWidget {
  height: 100%;
  padding: 8px;

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    margin: 0;
    font-size: 13px;

    @include info-rows;
  }

  // a row may need more than one key: they sit next to each other, with a small gap
  dt {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  // the action sits at the right edge, so the two columns read as a table
  dd {
    margin: 0;
    color: $text-icon;
    text-align: right;
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
