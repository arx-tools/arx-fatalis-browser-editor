<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue'
import { Settings } from 'lucide-vue-next'
import { createEditorShell } from '../modules/shell/createEditorShell.ts'
import { useEditorShell } from '../modules/shell/editorShellContext.ts'
import { widgetDefinitions } from '../widgetDefinitions.ts'
import { mountWidgetOverlay } from '../widgetOverlayMount.ts'

// the shell handle is reactive (the header reads it), the widgets themselves are lumino's: vue only
// hosts the dock element
const shell = useEditorShell()

const host = useTemplateRef<HTMLElement>('host')

/**
 * Tells whether the dock has no widget at all.
 *
 * @remarks
 * The `Custom` preset starts like this (2026-11-06), and so does a layout whose widgets were all removed one by one:
 * the invitation in the middle of the dock is the only thing on the screen then, and it says how a widget gets there.
 */
const isEmpty = computed(() => {
  return (shell.value?.placedKinds.value.length ?? 0) === 0
})

onMounted(() => {
  const element = host.value

  if (element === null) {
    throw new Error('The dock has no host element.')
  }

  shell.value = createEditorShell(element, widgetDefinitions, mountWidgetOverlay)
})

onBeforeUnmount(() => {
  shell.value?.dispose()
  shell.value = undefined
})
</script>

<template>
  <main ref="host" class="Dock">
    <p v-if="isEmpty" class="empty-hint">
      <!-- one span around the sentence: the grid of the hint centres the span, and the gear stays inside its line (a
           bare text run next to an element would be a grid item of its own, one row per piece) -->
      <span>
        Drag and drop widgets from the widget list
        <!-- the same gear the header shows above the widget picker: it is the button this sentence points at -->
        <Settings class="gear" :size="14" aria-hidden="true" />
        to form your own layout!
      </span>
    </p>
  </main>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The dock takes the remaining height of the shell. Lumino only inserts its own node into the host,
// so the host has to size it, and the layout is refitted on every size change of the host.
.Dock {
  position: relative;
  flex: 1;
  min-height: 0;

  // the invitation of an empty dock (the `Custom` preset, 2026-11-06): it sits in the middle of the whole dock, and it
  // takes no pointer event, so a widget dragged out of the picker passes over it and lands on the dock
  .empty-hint {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 32px;
    color: $text-dim;
    font-size: 12px;
    text-align: center;
    pointer-events: none;
    user-select: none;

    // the gear of the header, in the middle of the sentence: it sits on the line of the text, not under it
    .gear {
      vertical-align: -2px;
    }
  }

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
    background: $surface-panel;
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
    background: $interactive;
  }
}
</style>
