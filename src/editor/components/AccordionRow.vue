<script setup lang="ts">
import { ChevronDown, Minus } from 'lucide-vue-next'

/**
 * A row that folds its content away: the label, a value, and the arrow that says which way the fold is.
 *
 * @remarks
 * The entity list and the selection inspector had the same row twice: a head with the label and the arrow (and a value
 * on the right), and a content under it when the row is open. The two went apart (the entity list had the stripes and the
 * whole-row hover, the inspector had neither inside the fold), so the row is one component now (2026-11-22, the owner).
 *
 * The stripe the two rows disagreed on is gone (2026-11-25, the owner): the head is one line, the hover paints all of
 * it, and the lists that need a stripe keep it on their own rows.
 */
const props = defineProps<{
  /**
   * The label of the row.
   */
  readonly label: string
  /**
   * The value the row shows on the right, before the arrow: the count of the faces, of the entities of a folder.
   */
  readonly value?: string
  /**
   * Whether the content is on the screen.
   */
  readonly open: boolean
  /**
   * Whether the row has nothing to show.
   *
   * @remarks
   * An empty row does not fold: the click has no answer to give, and the arrow would promise one. It shows a dash in the
   * place of the arrow instead, in the same box, so the label and the value do not move (2026-11-22, the owner).
   */
  readonly empty?: boolean
}>()

/**
 * The row asks its list to fold or unfold it.
 */
const emit = defineEmits<{
  toggle: []
}>()

/**
 * Folds or unfolds the row, unless it is empty.
 */
function toggle(): void {
  if (props.empty) {
    return
  }

  emit('toggle')
}
</script>

<template>
  <div class="AccordionRow" :class="{ 'is-empty': empty === true }">
    <div
      class="head"
      :role="empty === true ? undefined : 'button'"
      :tabindex="empty === true ? undefined : 0"
      :aria-expanded="empty === true ? undefined : open"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <span class="label">{{ label }}</span>
      <span v-if="value !== undefined" class="value">{{ value }}</span>
      <Minus v-if="empty === true" class="icon dash" aria-hidden="true" />
      <ChevronDown v-else class="icon chevron" :class="{ 'is-open': open }" aria-hidden="true" />
    </div>
    <div v-if="open && empty !== true" class="content">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the row of a folded list: the head is one element, so the hover covers the label, the value and the arrow together
.AccordionRow {
  // the whole row is a control, not a text: the label, the value and the rows under it are clicked, and a shift click
  // that would select a name instead of picking a row is a lost gesture (2026-11-24, the owner: shift click on the
  // entity list selected the text). The `none` is inherited, so the content of the fold is covered with the head.
  user-select: none;

  > .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    user-select: none;
    // the color the head paints with: a widget that keeps the head on the top of a long list sets it (the rows under the
    // sticky head must not show through), and the list that does not have a color of its own leaves the head transparent
    background-color: var(--row-head-color, transparent);
  }

  // the head of a row with something to show takes the panel under the pointer; the empty row does not react at all
  // (2026-11-22, the owner: the off state must not change the base color)
  &:not(.is-empty) > .head:hover {
    background: $surface-panel;
  }

  &.is-empty > .head {
    cursor: default;
  }

  .label {
    flex: 1;
    overflow: hidden;
    color: $text-icon;
    font-size: 11px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-transform: uppercase;
  }

  .value {
    flex: none;
    color: $text-subtle;
    font-size: 11px;
  }

  // the box of the arrow and of the dash is the same, so the label and the value sit in the same place on every row
  .icon {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    color: $text-subtle;
  }

  .chevron {
    transition: transform 120ms ease;

    &.is-open {
      transform: rotate(180deg);
    }
  }

  .content {
    padding: 2px 6px 6px;
  }
}
</style>
