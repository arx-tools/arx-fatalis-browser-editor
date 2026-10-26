<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { widgetDefinitions } from '../widgetDefinitions.ts'
import { createEditorShell, type EditorShell } from '../modules/shell/createEditorShell.ts'

// the shell lives outside the reactive state: lumino owns the dom of the widgets, vue only hosts it
let shell: EditorShell | undefined

const host = useTemplateRef<HTMLElement>('host')

onMounted(() => {
  const element = host.value

  if (element === null) {
    throw new Error('The dock has no host element.')
  }

  shell = createEditorShell(element, widgetDefinitions)
})

onBeforeUnmount(() => {
  shell?.dispose()
  shell = undefined
})
</script>

<template>
  <main ref="host" class="Dock"></main>
</template>

<style scoped lang="scss">
// The dock takes the remaining height of the shell. Lumino only inserts its own node into the host,
// so the host has to size it, and the layout is refitted on every size change of the host.
.Dock {
  position: relative;
  flex: 1;
  min-height: 0;

  :deep(.lm-DockPanel) {
    position: absolute;
    inset: 0;
  }

  // one widget per dock area: the tab strip is not used (a widget kind exists at most once)
  :deep(.lm-DockPanel-tabBar) {
    display: none;
  }

  // the splitter between two widgets: lumino ships no style for it without its theme, so it is a thin
  // line here, and it is the element that is dragged to resize the widgets of the split
  :deep(.lm-DockPanel-handle) {
    background: #2f343b;
    cursor: ew-resize;

    // the splitter is thin, so the grab area is widened (the same idea as the lumino theme)
    &::after {
      position: absolute;
      inset: 0;
      content: '';
    }
  }

  :deep(.lm-DockPanel-handle[data-orientation='vertical']) {
    cursor: ns-resize;
  }

  :deep(.lm-DockPanel-handle[data-orientation='horizontal']::after) {
    min-width: 8px;
  }

  :deep(.lm-DockPanel-handle[data-orientation='vertical']::after) {
    min-height: 8px;
  }

  :deep(.lm-DockPanel-handle:hover) {
    background: #4a90d9;
  }
}
</style>
