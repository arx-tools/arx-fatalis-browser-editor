<script setup lang="ts">
import { Eye, EyeOff, Pencil, Plus, ScanSearch, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import {
  createFaceGroupFromSelection,
  deleteFaceGroups,
  faceGroupRows,
  faceIndicesOfGroup,
  renameFaceGroup,
  setFaceGroupVisibility,
  type FaceGroupRow,
} from '../../../modules/groups/groupStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { pickFaceGroup, selectedFaceGroups } from '../../../modules/groups/groupSelection.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { faceCountLabelOf } from '../../../modules/rooms/roomList.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { cameraStore } from '../camera/cameraStore.ts'
import { faceGroupExtentOf, faceGroupJumpPoseOf } from './groupInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The groups of the level on the screen.
 */
const rows = computed<readonly FaceGroupRow[]>(() => {
  return faceGroupRows.value
})

/**
 * How many faces are selected: the input of the button that makes a group.
 */
const selected = computed<number>(() => {
  return selectionStore.polygons.value.size
})

/**
 * What the line above the list says about the selection.
 */
const selectionLabel = computed<string>(() => {
  if (selected.value === 0) {
    return 'No faces are selected'
  }

  return `${String(selected.value)} face(s) selected`
})

/**
 * The id of the group being renamed, and the text of the field.
 *
 * @remarks
 * The ids are the ids of the level on the screen, which is the only level the widget lists. The field sits in the row,
 * the way the room inspector renames.
 */
const renaming = shallowRef<number | undefined>(undefined)
const draft = shallowRef('')

/**
 * The field of the row being renamed, so it can take the focus.
 *
 * @remarks
 * A plain variable with a function ref, and not `useTemplateRef`: the field sits in a `v-for` row, where a string ref may
 * arrive as the array of the rows.
 */
let nameField: HTMLInputElement | undefined

/**
 * The list of the groups, so a click in it can take the focus (the `Delete` of the inspector acts on the picked rows).
 */
const list = useTemplateRef<HTMLUListElement>('groupList')

/**
 * Takes the field of the row being renamed, and lets it go when the row closes.
 *
 * @param element The element the ref points at, or `null` when it unmounts.
 */
function captureNameField(element: unknown): void {
  if (element instanceof HTMLInputElement) {
    nameField = element

    return
  }

  nameField = undefined
}

/**
 * Puts the focus into the list, so the next `Delete` belongs to the groups.
 */
function focusList(): void {
  list.value?.focus()
}

/**
 * Makes a group of the selected faces.
 */
function createGroup(): void {
  createFaceGroupFromSelection()
}

/**
 * Picks a group: its faces arrive in the selection, with the modifiers of the click.
 *
 * @param row The group of the row.
 * @param event The click.
 */
function pick(row: FaceGroupRow, event: MouseEvent): void {
  pickFaceGroup(row.id, event)
}

/**
 * Opens the field of a row.
 *
 * @param row The group of the row.
 */
async function startRename(row: FaceGroupRow): Promise<void> {
  renaming.value = row.id
  // the field carries what the row shows, so the default name is there to type over, not only as a placeholder under an
  // empty field
  draft.value = row.label

  await nextTick()

  nameField?.focus()
  nameField?.select()
}

/**
 * Writes the name the author typed on the row, and closes the field.
 */
function commitRename(): void {
  const id = renaming.value

  if (id === undefined) {
    return
  }

  renaming.value = undefined

  const group = rows.value.find((row) => {
    return row.id === id
  })

  if (group === undefined || draft.value === group.label) {
    return
  }

  renameFaceGroup(currentMapId.value, group.id, draft.value)
}

/**
 * Closes the field of a row, and keeps the name it had.
 */
function cancelRename(): void {
  renaming.value = undefined
}

/**
 * Goes to a group: the camera steps back from its box, and the faces arrive in the selection.
 *
 * @remarks
 * The jump is the way to find a group the author can not see on the views: the distance follows the size of the box
 * (a few faces are looked at from close), and the selection marks what the camera went to. The light selection goes,
 * the way a pick of the faces takes it away.
 *
 * @param row The group to go to.
 */
function jumpTo(row: FaceGroupRow): void {
  const pose = cameraStore.pose.value
  const map = levelStore.map.value

  if (pose === undefined || map === undefined) {
    return
  }

  const indices = faceIndicesOfGroup(row.id)
  const extent = faceGroupExtentOf(map, indices)

  if (extent === undefined) {
    return
  }

  lightSelectionStore.clear()
  selectionStore.selectMany(indices, 'replace')
  cameraStore.moveCamera(faceGroupJumpPoseOf(pose, extent))
}

/**
 * Shows or hides the faces of a group.
 *
 * @param row The group to show or hide.
 */
function toggleVisibility(row: FaceGroupRow): void {
  setFaceGroupVisibility(currentMapId.value, row.id, !row.visible)
}

/**
 * Takes a group out of its level.
 *
 * @param row The group to take out.
 */
function removeGroup(row: FaceGroupRow): void {
  deleteFaceGroups(currentMapId.value, [row.id])
}
</script>

<template>
  <div class="GroupInspectorWidget">
    <WidgetHeading :label="props.label">
      <template #actions>
        <button
          class="group-add"
          type="button"
          :disabled="selected === 0"
          aria-label="Group the selected faces"
          title="Group the selected faces"
          @click="createGroup"
        >
          <Plus :size="14" />
        </button>
      </template>
    </WidgetHeading>
    <p class="selection">{{ selectionLabel }}</p>
    <ul ref="groupList" class="groups" tabindex="0" @pointerdown="focusList">
      <li
        v-for="row in rows"
        :key="row.id"
        class="group"
        :class="{ 'is-selected': selectedFaceGroups.has(row.id) }"
        @click="pick(row, $event)"
        @dblclick="startRename(row)"
      >
        <button
          class="eye"
          type="button"
          :class="{ 'is-visible': row.visible }"
          :aria-label="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
          :aria-pressed="row.visible"
          :title="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
          @click.stop="toggleVisibility(row)"
          @dblclick.stop
        >
          <Eye v-if="row.visible" :size="14" />
          <EyeOff v-else :size="14" />
        </button>
        <input
          v-if="renaming === row.id"
          :ref="captureNameField"
          v-model="draft"
          class="rename"
          type="text"
          :placeholder="row.label"
          :aria-label="`The name of group ${row.label}`"
          @click.stop
          @dblclick.stop
          @keydown.enter="commitRename"
          @keydown.esc="cancelRename"
          @blur="commitRename"
        />
        <span v-else class="name" :title="row.label">{{ row.label }}</span>
        <span class="count">{{ faceCountLabelOf(row.faceCount) }}</span>
        <button
          class="zoom"
          type="button"
          :aria-label="`Jump to ${row.label}`"
          :title="`Jump to ${row.label}`"
          @click.stop="jumpTo(row)"
          @dblclick.stop
        >
          <ScanSearch :size="13" />
        </button>
        <button
          class="edit"
          type="button"
          :aria-label="`Rename ${row.label}`"
          :title="`Rename ${row.label}`"
          @click.stop="startRename(row)"
          @dblclick.stop
        >
          <Pencil :size="13" />
        </button>
        <button
          class="trash"
          type="button"
          :aria-label="`Delete ${row.label}`"
          :title="`Delete ${row.label}`"
          @click.stop="removeGroup(row)"
        >
          <Trash2 :size="13" />
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The groups of the faces, under the name of the level they belong to: the open level first, the levels of the storage
// after it. The list is the part that scrolls, the selection line and the heading stay where they are.
.GroupInspectorWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;

  height: 100%;
  padding: 8px;
  font-size: 13px;
}

// the button of the heading: the frame and the size of the eye of the room inspector
.group-add {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 22px;
  padding: 0;
  color: $text-icon;
  background: rgba($surface-app, 0.72);
  border: 1px solid $border;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-panel;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

// what the selection is: the input of the button above
.selection {
  margin: 0;
  padding: 0 6px;
  overflow: hidden;
  color: $text-muted;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.groups {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 10px 0 0;
  overflow-y: auto;
  list-style: none;

  // the rows are a list to click, not text to copy; the focus of the list is what the Delete of the inspector reads, and
  // a mouse click does not need a ring for it
  user-select: none;

  &:focus-visible {
    outline: 1px solid $interactive;
    outline-offset: 2px;
  }
}

// the header of a section: the name of the level, the way the header of the editor writes it (`Blank: Flat Plane`), so
// the two read the same and the author knows which level the groups under it belong to
.group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  color: $text-muted;
  cursor: pointer;

  // the faint stripe of the information lists
  &:nth-child(even) {
    background: rgba($text-strong, 0.03);
  }

  &:hover {
    background: $surface-panel;
  }

  &.is-selected {
    color: $text;
    background: rgba($accent, 0.15);
  }
}

// the eye of the row: orange while the group is drawn, a crossed eye while its faces are out of the mesh
.eye {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: $text-subtle;
  background: none;
  border: 0;
  border-radius: 3px;
  cursor: pointer;

  &.is-visible {
    color: $accent;
  }

  &:hover:not(:disabled) {
    color: $text;
    background: $surface-panel;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// the field of a row being renamed: it takes the rest of the line, and the click on it stays in the field
.rename {
  flex: 1;
  min-width: 0;
  height: 20px;
  padding: 0 4px;
  color: $text;
  font: inherit;
  background: $surface-panel;
  border: 1px solid $border;
  border-radius: 3px;

  &:focus {
    border-color: $interactive;
    outline: 1px solid $interactive;
  }
}

.count {
  color: $text-subtle;
  font-size: 12px;
  white-space: nowrap;
}

// the pencil of a row: a rename without the double click, quiet until the row is under the pointer
.zoom,
.edit {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: $text-subtle;
  background: none;
  border: 0;
  border-radius: 3px;
  opacity: 0.6;
  cursor: pointer;

  &:hover {
    color: $text;
    background: $surface-panel;
    opacity: 1;
  }
}

// the trash of a row: quiet until the row is under the pointer, then the colour of a delete
.trash {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  color: $text-subtle;
  background: none;
  border: 0;
  border-radius: 3px;
  opacity: 0.6;
  cursor: pointer;

  &:hover {
    color: $danger-bright;
    background: $surface-panel;
    opacity: 1;
  }
}
</style>
