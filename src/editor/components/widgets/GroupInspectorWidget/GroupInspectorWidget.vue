<script setup lang="ts">
import { Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, shallowRef, useTemplateRef } from 'vue'
import {
  createFaceGroupFromSelection,
  deleteFaceGroups,
  faceGroupSections,
  renameFaceGroup,
  setFaceGroupVisibility,
  type FaceGroupRow,
  type FaceGroupSection,
} from '../../../modules/groups/groupStore.ts'
import { pickFaceGroup, selectedFaceGroups } from '../../../modules/groups/groupSelection.ts'
import { faceCountLabelOf } from '../../../modules/rooms/roomList.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The groups of every level the author made one on, the open level first.
 */
const sections = computed<readonly FaceGroupSection[]>(() => {
  return faceGroupSections.value
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
 * The name of the group being renamed, and the text of the field.
 *
 * @remarks
 * The key is the level and the group together: the ids are the ids of a level, so two levels can have a `group 1`. The
 * field sits in the row, the way the room inspector renames.
 */
const renaming = shallowRef<string | undefined>(undefined)
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
 * The key of a row: the level and the group together.
 *
 * @param mapId The value of the map of the section.
 * @param groupId The group the row stands for.
 *
 * @returns The key that keeps the groups of two levels apart.
 */
function rowKeyOf(mapId: string, groupId: number): string {
  return `${mapId}:${groupId.toString()}`
}

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
 * @param section The section of the row.
 * @param row The group of the row.
 * @param event The click.
 */
function pick(section: FaceGroupSection, row: FaceGroupRow, event: MouseEvent): void {
  // the faces are indices of the level of the row: another level has no faces here to select
  if (!section.isCurrent) {
    return
  }

  pickFaceGroup(row.id, event)
}

/**
 * Opens the field of a row.
 *
 * @param section The section of the row.
 * @param row The group of the row.
 */
async function startRename(section: FaceGroupSection, row: FaceGroupRow): Promise<void> {
  renaming.value = rowKeyOf(section.mapId, row.id)
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
  const key = renaming.value

  if (key === undefined) {
    return
  }

  renaming.value = undefined

  const separator = key.lastIndexOf(':')
  const mapId = key.slice(0, separator)
  const groupId = Number.parseInt(key.slice(separator + 1), 10)
  const group = sections.value
    .find((section) => {
      return section.mapId === mapId
    })
    ?.groups.find((row) => {
      return row.id === groupId
    })

  if (group === undefined || draft.value === group.label) {
    return
  }

  renameFaceGroup(mapId, groupId, draft.value)
}

/**
 * Closes the field of a row, and keeps the name it had.
 */
function cancelRename(): void {
  renaming.value = undefined
}

/**
 * Shows or hides the faces of a group.
 *
 * @param section The section of the row.
 * @param row The group to show or hide.
 */
function toggleVisibility(section: FaceGroupSection, row: FaceGroupRow): void {
  setFaceGroupVisibility(section.mapId, row.id, !row.visible)
}

/**
 * Takes a group out of its level.
 *
 * @param section The section of the row.
 * @param row The group to take out.
 */
function removeGroup(section: FaceGroupSection, row: FaceGroupRow): void {
  deleteFaceGroups(section.mapId, [row.id])
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
      <template v-for="section in sections" :key="section.mapId">
        <li v-if="section.groups.length > 0" class="section" :class="{ 'is-current': section.isCurrent }">
          {{ section.title }}
        </li>
        <li
          v-for="row in section.groups"
          :key="rowKeyOf(section.mapId, row.id)"
          class="group"
          :class="{
            'is-other': !section.isCurrent,
            'is-selected': section.isCurrent && selectedFaceGroups.has(row.id),
          }"
          @click="pick(section, row, $event)"
          @dblclick="startRename(section, row)"
        >
          <button
            class="eye"
            type="button"
            :class="{ 'is-visible': row.visible }"
            :disabled="!section.isCurrent"
            :aria-label="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
            :aria-pressed="row.visible"
            :title="row.visible ? `Hide ${row.label}` : `Show ${row.label}`"
            @click.stop="toggleVisibility(section, row)"
            @dblclick.stop
          >
            <Eye v-if="row.visible" :size="14" />
            <EyeOff v-else :size="14" />
          </button>
          <input
            v-if="renaming === rowKeyOf(section.mapId, row.id)"
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
            class="edit"
            type="button"
            :aria-label="`Rename ${row.label}`"
            :title="`Rename ${row.label}`"
            @click.stop="startRename(section, row)"
            @dblclick.stop
          >
            <Pencil :size="13" />
          </button>
          <button
            class="trash"
            type="button"
            :aria-label="`Delete ${row.label}`"
            :title="`Delete ${row.label}`"
            @click.stop="removeGroup(section, row)"
          >
            <Trash2 :size="13" />
          </button>
        </li>
      </template>
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
.section {
  padding: 6px 6px 3px;
  color: $text-icon;
  font-size: 11px;
  font-weight: bold;

  // another level is read, not worked on: its rows do not pick faces
  &:not(.is-current) {
    color: $text-subtle;
    font-weight: normal;
    opacity: 0.75;
  }
}

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

  // another level is read, not worked on: its rows pick no faces
  &.is-other {
    cursor: default;
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
