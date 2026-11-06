<script setup lang="ts">
// the mark of the source: the brand icons of lucide are deprecated, so this one comes from Simple Icons,
// which is what the lucide docs point at (https://simpleicons.org/?q=github)
import { siGithub } from 'simple-icons'
import DataDirPicker from './DataDirPicker.vue'
import ExportMap from './ExportMap.vue'
import LevelSelector from './LevelSelector.vue'
import MapsToOpen from './MapsToOpen.vue'
import WidgetManager from './WidgetManager.vue'

// the version, the commit and the build date of this build (see `vite.config.ts`)
const buildInfo = BUILD_INFO
</script>

<template>
  <header class="EditorHeader">
    <div class="brand">
      <span class="title">Arx Fatalis Browser Editor</span>
      <span class="version">{{ buildInfo }}</span>
      <span class="dot" aria-hidden="true">·</span>
      <a
        class="source"
        href="https://github.com/arx-tools/arx-fatalis-browser-editor"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="The source of the editor on GitHub"
        v-tooltip="'Visit the project on GitHub'"
      >
        <svg class="source-mark" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="siGithub.path" fill="currentColor" />
        </svg>
      </a>
      <span class="dot" aria-hidden="true">·</span>
      <a
        class="support"
        href="https://github.com/sponsors/meszaros-lajos-gyorgy"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Support the project on GitHub Sponsors"
      >
        <span class="support-text">Don't hate, donate!</span>
      </a>
    </div>

    <div class="levels">
      <LevelSelector />
      <span class="dot" aria-hidden="true">·</span>
      <DataDirPicker />
      <span class="dot" aria-hidden="true">·</span>
      <MapsToOpen />
      <span class="dot" aria-hidden="true">·</span>
      <ExportMap />
    </div>

    <WidgetManager />
  </header>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The header is scoped: the root class is the component name, the nested names stay short, and the
// nesting only follows the elements of this component.
.EditorHeader {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-bottom: 1px solid $border-dark;
  background: $surface-float;

  // the level of the document and the folder of the game sit in the middle of the header: they are what the editor
  // shows, and the widget tools on the right are about the view of it. The box is out of the row of the flex, so the
  // middle is the middle of the header and not the middle of the space the brand leaves
  .levels {
    position: absolute;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 8px;
    transform: translateX(-50%);
  }

  // the separator between the sections of the middle bar (2026-11-06, the owner's request): a quiet dot, and not a
  // border, so it reads as a divider without drawing a line between the groups
  .levels .dot {
    color: $text-subtle;
    user-select: none;
  }

  // the brand takes the free space, so the widget manager ends up on the right side
  .brand {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: 8px;
    min-width: 0;

    .title {
      color: $text;
      white-space: nowrap;
    }

    // the version, the commit and the build date: muted, so the title stays the loud one
    .version {
      color: $text-subtle;
      font-size: 11px;
      white-space: nowrap;
    }

    // the mark of the source: it reads as a part of the version line, so it takes its colour, and it lights
    // up to the colour of the title when the pointer is over it
    .source,
    .support {
      display: inline-flex;
      align-items: center;
      color: $text-subtle;
      text-decoration: none;

      // the brand is a baseline aligned row, and a replaced element has its bottom edge on that baseline:
      // centring this one on the line puts the mark level with the text instead of riding above it
      align-self: center;

      &:hover {
        color: $text;
      }
    }

    // the separator between the version, the source and the tip jar: it is a plain dot, so it reads as a
    // quiet divider and not as a link
    .dot {
      color: $text-subtle;
    }

    // the way to the tip jar: a quiet line of text, the same weight as the version next to it, so the
    // header keeps the title as the loud one
    .support {
      white-space: nowrap;

      .support-text {
        font-size: 11px;
      }
    }

    // the mark is a touch bigger than the text of the version, so it reads as big as the title next to it
    .source-mark {
      width: 14px;
      height: 14px;
    }
  }
}
</style>
