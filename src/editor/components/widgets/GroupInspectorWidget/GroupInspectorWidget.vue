<script setup lang="ts">
import { Pencil, Plus, Power, ScanSearch, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import {
  createFaceGroupFromSelection,
  deleteFaceGroups,
  renameFaceGroup,
  setFaceGroupVisibility,
} from '../../../modules/groups/groupCommands.ts'
import { faceGroupRows } from '../../../modules/groups/groupDerived.ts'
import { faceIndicesOfGroup } from '../../../modules/groups/groupQueries.ts'
import { groupsOnAnotherVersion } from '../../../modules/groups/groupState.ts'
import type { FaceGroupRow } from '../../../modules/groups/groupTypes.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { pickFaceGroup, selectedFaceGroups } from '../../../modules/groups/groupSelection.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { faceCountLabelOf } from '../../../modules/rooms/roomList.ts'
import { lightSelectionStore } from '../../../modules/selection/lightSelectionStore.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import InspectorRow from '../../InspectorRow.vue'
import IconButton from '../../IconButton.vue'
import RowActionButton from '../../RowActionButton.vue'
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
 * The text of the tooltip of the visibility of a group.
 *
 * @remarks
 * A hidden group is not only out of the view: the export writes the level without its faces, so the switch is a power
 * and the tooltip says what the archive carries (2026-11-27, the owner: the switch of an export setting is the power).
 *
 * @param row The group the switch stands on.
 *
 * @returns What the next click does, and what the export carries.
 */
function visibilityTooltip(row: FaceGroupRow): string {
  if (row.visible) {
    return 'Hide the group. Affects the export.'
  }

  return 'Show the group. Affects the export.'
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
        <span class="total">Total: {{ rows.length }}</span>
        <IconButton class="group-add" label="Group the selected faces" :disabled="selected === 0" @click="createGroup">
          <Plus :size="14" />
        </IconButton>
      </template>
    </WidgetHeading>
    <p class="selection">{{ selectionLabel }}</p>
    <p v-if="groupsOnAnotherVersion" class="version-note" role="status">
      Groups of another version of this level are kept, and not shown.
    </p>
    <ul ref="groupList" class="groups" tabindex="0" @pointerdown="focusList">
      <InspectorRow
        v-for="row in rows"
        :key="row.id"
        class="group"
        :class="{ 'is-selected': selectedFaceGroups.has(row.id) }"
        @click="pick(row, $event)"
        @dblclick="startRename(row)"
      >
        <RowActionButton
          :label="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
          :tooltip="visibilityTooltip(row)"
          :pressed="row.visible"
          @click.stop="toggleVisibility(row)"
          @dblclick.stop
        >
          <Power :size="14" />
        </RowActionButton>
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
        <span v-else class="name" v-tooltip="row.label">{{ row.label }}</span>
        <span class="count">{{ faceCountLabelOf(row.faceCount) }}</span>
        <RowActionButton :label="`Jump to ${row.label}`" muted @click.stop="jumpTo(row)" @dblclick.stop>
          <ScanSearch :size="14" />
        </RowActionButton>
        <RowActionButton :label="`Rename ${row.label}`" muted @click.stop="startRename(row)" @dblclick.stop>
          <Pencil :size="14" />
        </RowActionButton>
        <RowActionButton :label="`Delete ${row.label}`" muted danger @click.stop="removeGroup(row)">
          <Trash2 :size="14" />
        </RowActionButton>
      </InspectorRow>
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
  padding: 0 8px 8px;
  font-size: 13px;
}

// the button of the heading: the frame and the size of the eye of the room inspector
// the note of a level whose groups belong to another version of its file: the list under it is empty, and the note says
// where the groups went
.version-note {
  margin: 0;
  padding: 0 6px;
  color: $text-muted;
  font-size: 12px;
  line-height: 1.35;
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
  color: $text-muted;

  &.is-selected {
    color: $text;
    background: rgba($accent, 0.15);
  }
}

// the eye of the row: orange while the group is drawn, a crossed eye while its faces are out of the mesh
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
// the trash of a row: quiet until the row is under the pointer, then the color of a delete
</style>
