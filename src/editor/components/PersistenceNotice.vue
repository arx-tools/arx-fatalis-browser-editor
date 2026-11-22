<script setup lang="ts">
import { computed, ref } from 'vue'
import { TriangleAlert, X } from 'lucide-vue-next'
import {
  dismissPersistenceProblems,
  persistenceNoticeOf,
  persistenceProblems,
} from '../modules/persistedRef/persistenceProblems.ts'
import Modal from './Modal.vue'
import RowActionButton from './RowActionButton.vue'

/**
 * The bar of the shell that says the browser can not keep something, and the list behind it.
 *
 * @remarks
 * The `persistedRef` reports what it could not write (a blocked or a full storage, a missing url) into
 * `persistenceProblems`, and the console is the only place those went: a quiet warning of a browser that lost the
 * layout, the camera poses or the history is what the author has to know (2026-11-22, the owner: the 66).
 *
 * The bar sits at the bottom of the shell, one line of the first problem, and the `+N` of it opens the list of all of
 * them with the key and the target of each (2026-11-22, the owner: *„ha most 24 more, akkor azt valahogy meg is kéne
 * nézni"*). The close hides the bar for the session: the same failure stays quiet, a new one comes back.
 */
const notice = computed<string | undefined>(() => {
  return persistenceNoticeOf(persistenceProblems.value)
})

/**
 * How many problems the bar does not name: the count of the list behind the `+N`.
 */
const rest = computed<number>(() => {
  return Math.max(persistenceProblems.value.length - 1, 0)
})

/**
 * Whether the list of the problems is open.
 */
const isListOpen = ref(false)

/**
 * Closes the bar for the session, and the list with it.
 */
function dismiss(): void {
  isListOpen.value = false
  dismissPersistenceProblems()
}
</script>

<template>
  <div v-if="notice !== undefined" class="PersistenceNotice">
    <TriangleAlert class="icon" :size="14" aria-hidden="true" />
    <span class="text" role="status">{{ notice }}</span>
    <button v-if="rest > 0" class="more" type="button" @click="isListOpen = true">+{{ rest }} more</button>
    <RowActionButton class="close" label="Dismiss the warning" muted @click="dismiss">
      <X :size="14" aria-hidden="true" />
    </RowActionButton>

    <Modal v-if="isListOpen" title="The browser could not persist everything" wide @close="isListOpen = false">
      <ul class="problems">
        <li v-for="problem in persistenceProblems" :key="`${problem.key}:${problem.target}`" class="problem">
          <span class="message">{{ problem.message }}</span>
          <span class="where">{{ problem.key }} · {{ problem.target }}</span>
        </li>
      </ul>
    </Modal>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// the one line of the warning, at the bottom of the shell: the dock leaves it the 26 pixels while it is there (the
// shell is a column), and the sentence of a long message is cut with the ellipsis instead of wrapping the bar
.PersistenceNotice {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 4px 0 12px;
  border-top: 1px solid $border-dark;
  background: $surface-float;
  color: $text-muted;
  font-size: 12px;

  .icon {
    flex: none;
    color: $accent;
  }

  // the message takes its own width (and is cut when the bar is narrow), so the count of the rest follows it instead of
  // floating to the right edge (2026-11-22, the owner)
  .text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  // the count of the rest is the way into the list: it reads as a link, and it is a button (the keyboard reaches it)
  .more {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    color: $text-muted;
    font: inherit;
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;

    &:hover {
      color: $text;
    }
  }

  // the close keeps the right edge of the bar, the count stays with the message
  .close {
    flex: none;
    margin-left: auto;
  }
}

// the list of the problems: one sentence and the key and the target that failed, and the list scrolls when a broken
// storage leaves a few dozen of them. The rows are close (no gap between them), and every second one is a stripe of
// the panel colour: a dozen rows of two lines are read by the stripe, not by a line between them
// (2026-11-22, the owner)
.problems {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  max-height: 50vh;
  overflow-y: auto;
  list-style: none;

  .problem {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 6px;
    border-radius: 3px;

    &:nth-child(even) {
      background: rgba($surface-panel, 0.45);
    }
  }

  .message {
    color: $text;
    font-size: 12px;
  }

  .where {
    color: $text-subtle;
    font-size: 11px;
  }
}
</style>
