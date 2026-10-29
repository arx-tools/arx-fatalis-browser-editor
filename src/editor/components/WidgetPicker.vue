<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Check, GripVertical, Trash2 } from 'lucide-vue-next'
import { dragWidget } from '../modules/layout/dragDrop.ts'
import { pickerRows } from '../modules/layout/pickerRows.ts'
import { useEditorShell } from '../modules/shell/editorShellContext.ts'

const emit = defineEmits<{
  /**
   * The picker has to be closed: the caller hides it.
   */
  close: []
}>()

const shell = useEditorShell()
const isDragging = ref(false)

/**
 * The categories of the popup: a placed kind offers the trash, a free one can be dragged in.
 */
const groups = computed(() => {
  const current = shell.value

  if (current === undefined) {
    return []
  }

  return pickerRows(current.definitions, current.placedKinds.value)
})

/**
 * Asks the editor to locate the widget of a placed row, or clears the spotlight.
 *
 * @param kind The kind of the hovered row, or `null` when the pointer left it.
 */
function spotlight(kind: string | null): void {
  shell.value?.editor.spotlight(kind)
}

/**
 * Removes the widget of a placed row from the dock.
 *
 * @param kind The kind of the widget to remove.
 */
function remove(kind: string): void {
  shell.value?.removeWidgetByKind(kind)
  spotlight(null)
}

// if the popup closes while a row is hovered, no pointerleave arrives, so the marks are cleared here
onBeforeUnmount(() => {
  spotlight(null)
})

/**
 * Drags a free kind out of the popup and puts the new widget where it is dropped.
 *
 * @param event The press that arms the drag.
 * @param kind The kind of the widget to create.
 */
async function startDrag(event: PointerEvent, kind: string): Promise<void> {
  const current = shell.value
  const row = groups.value
    .flatMap((group) => {
      return group.rows
    })
    .find((candidate) => {
      return candidate.kind === kind
    })

  if (current === undefined || row === undefined || row.isPlaced || event.button !== 0) {
    return
  }

  event.preventDefault()

  const target = await dragWidget({
    label: row.label,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerId: event.pointerId,
    dock: current.dock,
    container: current.host,
    onDragStateChange: (dragging) => {
      isDragging.value = dragging
    },
  })

  if (target === null) {
    return
  }

  current.addWidget(kind, { mode: target.mode, ref: target.ref })
  emit('close')
}
</script>

<template>
  <div class="WidgetPicker" :class="{ 'is-dragging': isDragging }" role="menu" aria-label="Add a widget">
    <div v-for="group in groups" :key="group.group" class="group">
      <span class="heading">{{ group.label }}</span>
      <div
        v-for="row in group.rows"
        :key="row.kind"
        class="row"
        :class="{ 'is-placed': row.isPlaced }"
        role="menuitem"
        :data-picker-kind="row.kind"
        @pointerdown="startDrag($event, row.kind)"
        @pointerenter="spotlight(row.isPlaced ? row.kind : null)"
        @pointerleave="spotlight(null)"
      >
        <Check v-if="row.isPlaced" class="mark" :size="13" aria-hidden="true" />
        <GripVertical v-else class="grip" :size="13" aria-hidden="true" />
        <span class="name">{{ row.label }}</span>
        <button
          v-if="row.isPlaced"
          class="trash"
          type="button"
          v-tooltip="`Remove the ${row.label} widget`"
          :aria-label="`Remove the ${row.label} widget`"
          @pointerdown.stop
          @click="remove(row.kind)"
        >
          <Trash2 :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../palette' as *;

// The popup of the `+` button: one row per widget kind. The left slot is the grip of a free row and
// the check of a placed one (so no row looks half-done), the right one is the trash of a placed kind;
// while a widget is dragged out of the popup it fades to 75% transparency.
.WidgetPicker {
  position: absolute;
  z-index: 50;
  top: 4px;
  left: 0;
  transform: translateX(-50%);
  min-width: 170px;
  padding: 4px;
  background: $surface-float;
  border: 1px solid $border;
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba($ink, 0.55);
  transition: opacity 120ms ease-out;

  &.is-dragging {
    opacity: 0.25;
  }

  // the heading of a category: never a drag source, its only job is to separate the rows
  .heading {
    display: block;
    padding: 6px 8px 2px;
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: $text-subtle;
  }

  .group + .group .heading {
    padding-top: 10px;
    border-top: 1px solid $border-dark;
    margin-top: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: grab;
    touch-action: none;
    user-select: none;

    &:hover {
      color: $text-strong;
      background: $surface-panel;
    }

    &.is-placed {
      cursor: default;
    }

    .grip,
    .mark {
      flex: none;
    }

    .grip {
      color: $text-dim;
    }

    .mark {
      color: $ok;
    }

    .name {
      flex: 1;
      white-space: nowrap;
    }

    .trash {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      padding: 0;
      color: $danger-muted;
      background: transparent;
      border: none;
      border-radius: 3px;
      cursor: pointer;

      &:hover {
        color: $text-strong;
        background: rgba($danger, 0.85);
      }
    }
  }
}
</style>
