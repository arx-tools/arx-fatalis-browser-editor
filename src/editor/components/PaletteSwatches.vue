<script setup lang="ts">
/**
 * The palette of the editor, token by token: a chip of the color and the name of the token.
 *
 * @remarks
 * A story-only view: the editor never mounts it, it is here so a new color is picked from the tokens and not from a raw
 * value. The chips take the color from the same `palette.scss` the widgets use.
 */
const groups = [
  {
    title: 'Surfaces',
    tokens: [
      'surface-widget',
      'surface-app',
      'surface-float',
      'surface-panel',
      'surface-raised',
      'surface-overlay',
      'surface-drag-source',
      'surface-spotlit',
    ],
  },
  { title: 'Borders', tokens: ['border-dark', 'border', 'border-strong'] },
  {
    title: 'Text',
    tokens: ['text-subtle', 'text-muted', 'text-icon', 'text', 'text-strong', 'text-on-danger'],
  },
  { title: 'Accent', tokens: ['accent', 'interactive', 'ok', 'marker'] },
  { title: 'Danger', tokens: ['danger', 'danger-bright', 'danger-deep', 'danger-muted'] },
  { title: 'Misc', tokens: ['ink', 'on-veil'] },
] as const
</script>

<template>
  <div class="PaletteSwatches">
    <section v-for="group in groups" :key="group.title" class="group">
      <h3>{{ group.title }}</h3>
      <div class="chips">
        <div v-for="token in group.tokens" :key="token" class="row">
          <span class="chip" :class="`is-${token}`"></span>
          <code>{{ token }}</code>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

.PaletteSwatches {
  padding: 16px;
  color: $text;
  font-size: 12px;

  .group {
    margin-bottom: 18px;
  }

  h3 {
    margin: 0 0 8px;
    color: $text-strong;
    font-size: 13px;
  }

  .chips {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px 12px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .chip {
    flex: none;
    width: 20px;
    height: 20px;
    border: 1px solid $border;
    border-radius: 3px;
  }

  code {
    color: $text-muted;
    font-family: inherit;
  }

  .is-surface-widget {
    background: $surface-widget;
  }
  .is-surface-app {
    background: $surface-app;
  }
  .is-surface-float {
    background: $surface-float;
  }
  .is-surface-panel {
    background: $surface-panel;
  }
  .is-surface-raised {
    background: $surface-raised;
  }
  .is-surface-overlay {
    background: $surface-overlay;
  }
  .is-surface-drag-source {
    background: $surface-drag-source;
  }
  .is-surface-spotlit {
    background: $surface-spotlit;
  }
  .is-border-dark {
    background: $border-dark;
  }
  .is-border {
    background: $border;
  }
  .is-border-strong {
    background: $border-strong;
  }
  .is-text-subtle {
    background: $text-subtle;
  }
  .is-text-muted {
    background: $text-muted;
  }
  .is-text-icon {
    background: $text-icon;
  }
  .is-text {
    background: $text;
  }
  .is-text-strong {
    background: $text-strong;
  }
  .is-text-on-danger {
    background: $text-on-danger;
  }
  .is-accent {
    background: $accent;
  }
  .is-interactive {
    background: $interactive;
  }
  .is-ok {
    background: $ok;
  }
  .is-marker {
    background: $marker;
  }
  .is-danger {
    background: $danger;
  }
  .is-danger-bright {
    background: $danger-bright;
  }
  .is-danger-deep {
    background: $danger-deep;
  }
  .is-danger-muted {
    background: $danger-muted;
  }
  .is-ink {
    background: $ink;
  }
  .is-on-veil {
    background: $on-veil;
  }
}
</style>
