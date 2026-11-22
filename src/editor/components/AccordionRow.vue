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
 * The stripes and the hover paint the **whole head**, not its cells: the head is one element, which is why the hover of
 * the inspector's rows stops at the value in the old markup.
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
   * Whether the row carries a stripe: the list passes the parity of the row, so a longer list reads like a table.
   */
  readonly stripe?: boolean
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
  <div class="AccordionRow" :class="{ 'is-stripe': stripe === true, 'is-empty': empty === true }">
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

// the row of a folded list: the head is one element, so the stripe and the hover cover the label, the value and the arrow
// together. The stripe is a step darker than the widget, the hover a step lighter, so a striped row still answers the
// pointer
.AccordionRow {
  // the stripe is the colour of the row, and the hover is an image over it, so a hovered striped row keeps its stripe and
  // only takes the tint (a hover that replaced the colour would wipe the stripe out)
  &.is-stripe > .head {
    background-color: rgba($surface-panel, 0.45);
  }

  > .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    border-radius: 3px;
    cursor: pointer;
    user-select: none;

    &:hover {
      background-image: linear-gradient(rgba($text-strong, 0.06), rgba($text-strong, 0.06));
    }
  }

  // the row with nothing to show: no pointer and no hover tint, but the stripe it may carry stays (2026-11-22, the
  // owner: the off state must not change the base colour)
  &.is-empty > .head {
    cursor: default;

    &:hover {
      background-image: none;
    }
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
