<script setup lang="ts">
import { Check, Eye, EyeOff, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import {
  faceCountLabelOf,
  filteredRoomRows,
  NO_ROOM,
  roomRowsOf,
  type RoomRow,
} from '../../../modules/rooms/roomList.ts'
import { deleteRooms } from '../../../modules/rooms/roomDeletion.ts'
import { createRoomWithSelection, moveSelectionToRoom } from '../../../modules/rooms/roomMapper.ts'
import {
  nameOf,
  renameRoomAsStep,
  roomNameOf,
  roomNamesOnAnotherVersion,
  UNNAMED_ROOM,
} from '../../../modules/rooms/roomNames.ts'
import { portalRevision } from '../../../modules/rooms/portalSync.ts'
import { pickRoom, roomsOfFaces } from '../../../modules/rooms/roomSelection.ts'
import { clearRoomHover, hoveredRoom, hoverRoom, selectedRooms, selectRoom } from '../../../modules/rooms/roomStore.ts'
import { currentRoom } from '../../../modules/rooms/roomUnderCrosshair.ts'
import { selectionModeOf, selectionStore } from '../../../modules/selection/selectionStore.ts'
import ColorSwatch from '../../ColorSwatch.vue'
import EmptyMessage from '../../EmptyMessage.vue'
import SearchField from '../../SearchField.vue'
import InspectorRow from '../../InspectorRow.vue'
import RowActionButton from '../../RowActionButton.vue'
import SectionTitle from '../../SectionTitle.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import { isMeshVisible, isRoomColorsVisible, toggleRoomColors } from '../shared/levelDisplay.ts'
import { roomProblemsOf, type RoomProblem } from './roomInspector.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * Whether the room map is drawn, which the eye of the title shows.
 *
 * @remarks
 * It is the same switch the key help flips with `R`: the panel does not keep a state of its own, so the two can not
 * disagree about whether the map is on.
 */
const showsRooms = computed(() => {
  return isRoomColorsVisible.value
})

/**
 * What the switch of the title says: the same words the key help uses for the row it stands for, so a reader who
 * learned one of the two reads the other.
 */
const toggleTooltip = computed(() => {
  if (!isMeshVisible.value) {
    return 'the mesh is off'
  }

  if (showsRooms.value) {
    return 'Hide the rooms'
  }

  return 'Show the rooms'
})

/**
 * The rooms of the level, with the color the room map paints them with.
 */
const rows = shallowRef<RoomRow[]>([])

/**
 * What the author can not see in the view: the faces without a room, and the level that is one room.
 */
const problems = shallowRef<RoomProblem[]>([])

/**
 * The rooms the selected faces are in, `-1` for a face without a room.
 *
 * @remarks
 * The selection is the input of the three moves of the panel: the label above the list says where it is, and the
 * moves act on it. The rooms are read here, so the move row and the label read the same state.
 */
const selectionRooms = shallowRef<ReadonlySet<number>>(new Set())

/**
 * What the author typed into the search field.
 *
 * @remarks
 * The search came over from the room mapper (2026-11-15, the owner: the list of the inspector is where the rooms are
 * read and renamed, so the filter is worth having there, and the mapper's list is gone with it).
 */
const query = shallowRef('')

/**
 * The list of the rooms, so a click in it can take the focus (the `Delete` of the inspector acts on the picked rows).
 */
const roomsList = useTemplateRef<HTMLUListElement>('roomList')

/**
 * The rooms the search lets through.
 */
const shown = computed(() => {
  return filteredRoomRows(rows.value, query.value)
})

/**
 * How many faces are selected.
 */
const selected = computed(() => {
  return selectionStore.polygons.value.size
})

/**
 * The rooms of the selection, without the faces that have none.
 */
const foundRooms = computed(() => {
  return [...selectionRooms.value].filter((room) => {
    return room >= 0
  })
})

/**
 * What the panel says about the rooms of the selection.
 */
const selectionLabel = computed(() => {
  if (selected.value === 0) {
    return 'No faces are selected'
  }

  if (foundRooms.value.length === 0) {
    return `${String(selected.value)} face(s) without a room`
  }

  if (foundRooms.value.length === 1) {
    return `${String(selected.value)} face(s) in room ${String(foundRooms.value[0])}`
  }

  return `${String(selected.value)} face(s) in ${String(foundRooms.value.length)} rooms`
})

/**
 * The room the move writes, from the dropdown of the move row.
 *
 * @remarks
 * The three things the selection can become are one row under the list (2026-11-15, the owner: a mode hid the other
 * two): a new room, the room of the dropdown, or no room at all. The dropdown is the target of the move, so the room
 * can be picked without a mode and the other two moves stay one click away.
 */
const moveTarget = shallowRef<number | undefined>(undefined)

/**
 * What an option of the move dropdown says: the room and the name the author gave it.
 *
 * @param room The id of the room.
 *
 * @returns The text of the option.
 */
function moveLabelOf(room: number): string {
  const name = roomNameOf(room)

  if (name === undefined) {
    return `room ${room}`
  }

  return `room ${room} · ${name}`
}

/**
 * How the list writes a room: the room id, or `no room` for the faces no room holds.
 *
 * @param room The id of the room.
 *
 * @returns The label of its row.
 */
function roomLabelOf(room: number): string {
  if (room === NO_ROOM) {
    return 'no room'
  }

  return `room ${room}`
}

/**
 * What the title of a row says: the name the author gave the room, or `no room`.
 *
 * @param room The id of the room.
 *
 * @returns The title of the row.
 */
function roomTitleOf(room: number): string {
  if (room === NO_ROOM) {
    return 'no room'
  }

  return nameOf(room)
}

/**
 * The rooms the move dropdown offers: the rooms of the level, and not the faces without a room.
 *
 * @remarks
 * The row of the faces outside every room is a pick of the list, not a room to move into: taking a face out of its room
 * is what the last button of the panel does.
 */
const moveTargets = computed(() => {
  return rows.value.filter((row) => {
    return row.room !== NO_ROOM
  })
})

/**
 * Whether the selected faces are in the room of the dropdown already.
 *
 * @remarks
 * The move would be a step of the history that writes the same room on every face, so the check stays off: the dropdown
 * makes the room of the selection a click away, and an undo step of nothing is only noise.
 */
const isAlreadyThere = computed(() => {
  return moveTarget.value !== undefined && selectionRooms.value.size === 1 && selectionRooms.value.has(moveTarget.value)
})

/**
 * Whether the move has where to go: a room in the dropdown, a selection, and not the room the faces are in already.
 */
const canMove = computed(() => {
  return moveTarget.value !== undefined && selected.value > 0 && !isAlreadyThere.value
})

/**
 * Whether the selection has a room to be taken out of.
 *
 * @remarks
 * A face without a room is already out: a selection of only such faces leaves the button off, because the step would
 * write the room the faces have (none) back (2026-11-15, the owner: the whole selection in `no room` is a disabled
 * button, not a step of nothing).
 */
const canUnset = computed(() => {
  return selected.value > 0 && foundRooms.value.length > 0
})

/**
 * What the button of the unset explains about itself.
 */
const unsetTitle = computed(() => {
  if (selected.value === 0) {
    return 'Select the faces to take out of their room first'
  }

  if (foundRooms.value.length === 0) {
    return 'The selected faces have no room already'
  }

  return 'Take the selected faces out of their room'
})

/**
 * What the check of the move row explains about itself.
 */
const moveTitle = computed(() => {
  if (selected.value === 0) {
    return 'Select the faces to move first'
  }

  if (moveTarget.value === undefined) {
    return 'Pick a room from the dropdown first'
  }

  if (isAlreadyThere.value) {
    return 'The selected faces are in this room already'
  }

  return `Move the selected faces into room ${String(moveTarget.value)}`
})

/**
 * Reads the rooms, the problems and the rooms of the selection again.
 *
 * @remarks
 * The level and its revision are the signal: a load replaces the rooms, an edit moves the faces between them. The
 * selection is watched too: the label and the moves follow it.
 */
function rebuild(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    rows.value = []
    problems.value = []
    selectionRooms.value = new Set()
    moveTarget.value = undefined

    return
  }

  rows.value = roomRowsOf(map)
  problems.value = roomProblemsOf(map)
  selectionRooms.value = roomsOfFaces(map, selectionStore.polygons.value)

  const picked = moveTarget.value

  if (
    picked !== undefined &&
    rows.value.every((row) => {
      return row.room !== picked
    })
  ) {
    moveTarget.value = undefined
  }
}

watch(
  [
    levelStore.map,
    levelRevision,
    portalRevision,
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
  ],
  () => {
    rebuild()
  },
  { immediate: true },
)

// the picked room is an id of a level: another level has other ids, so neither the pick nor the hover survives it
watch(levelStore.map, () => {
  selectRoom(undefined)
  clearRoomHover()
})

// another selection is another set of faces: the room of the dropdown was the target of the old one (2026-11-15, the
// owner)
watch(
  () => {
    return selectionStore.polygons.value
  },
  () => {
    moveTarget.value = undefined
  },
)

/**
 * Whether the pick is exactly this room.
 *
 * @param room The room the row stands for.
 *
 * @returns True when the room is the only one highlighted.
 */
function isPicked(room: number): boolean {
  return selectedRooms.value.size === 1 && selectedRooms.value.has(room)
}

/**
 * The room of the row being renamed, and the text of the field.
 *
 * @remarks
 * A double click on a row opens the field **in the row**, so the list is renamed where it reads: the field under the
 * list is gone (2026-11-15, the owner). The row is still the pick, and the two clicks of a double click toggle the
 * pick twice, so the pick of the row is what it was before the rename.
 */
const renaming = shallowRef<number | undefined>(undefined)
const draft = shallowRef('')

/**
 * The field of the row being renamed, so it can take the focus.
 *
 * @remarks
 * A plain variable with a function ref, and not `useTemplateRef`: the field sits in a `v-for` row, where a string ref
 * may arrive as the array of the rows, and the focus would go nowhere.
 */
let nameField: HTMLInputElement | undefined

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
 * Opens the field of a row.
 *
 * @remarks
 * The field takes the focus and selects the name, so a double click and a typing is a rename: the author does not
 * have to clear the old name first.
 *
 * The field starts with the name the room **has**, and an unnamed one starts empty: the placeholder says what the room
 * is, but it is not a value, so a click away does not name the room `Unnamed area` (2026-11-15, the owner's catch).
 *
 * @param room The id of the room.
 */
async function startRename(room: number): Promise<void> {
  // the faces no room holds have no name to write
  if (room === NO_ROOM) {
    return
  }

  renaming.value = room
  draft.value = roomNameOf(room) ?? ''

  await nextTick()

  nameField?.focus()
  nameField?.select()
}

/**
 * Writes the name the author typed on the row, and closes the field.
 *
 * @remarks
 * An empty field takes the name away (the row says {@link UNNAMED_ROOM} again). A field that was closed by the Escape
 * has no room any more, so the blur that follows the unmount writes nothing.
 */
function commitRename(): void {
  const room = renaming.value

  if (room === undefined) {
    return
  }

  renaming.value = undefined

  if (draft.value !== (roomNameOf(room) ?? '')) {
    renameRoomAsStep(room, draft.value)
  }
}

/**
 * Closes the field of a row, and keeps the name it had.
 */
function cancelRename(): void {
  renaming.value = undefined
}

/**
 * Picks a room, or clears the pick when the picked room is clicked again.
 *
 * @remarks
 * The pick is a face selection (`roomSelection.ts`): its faces arrive selected, so the same gesture that shows the room
 * is the one that makes it the working set. The room map stays as the author left it: a pick writes the selection, not
 * the switch of the map (2026-11-14, the owner overrode the earlier "the map comes on with the pick"), and a second
 * click on the same row clears the pick and the selection with it.
 *
 * `Shift` adds the room to the selection and `Ctrl`/`Meta` takes it away, the modes of the walkable view: a room
 * clicked with `Shift` while another one is picked makes the selection span both, and the rows of both light up.
 *
 * @param room The room the row stands for.
 * @param event The click, whose modifiers decide what the row does with the selection.
 */
function pick(room: number, event: MouseEvent): void {
  const mode = selectionModeOf(event)

  if (mode === 'replace' && isPicked(room)) {
    pickRoom(undefined)

    return
  }

  pickRoom(room, mode)
}

/**
 * Moves the selected faces into the room of the dropdown.
 */
function moveToTarget(): void {
  const room = moveTarget.value

  if (room === undefined || !canMove.value) {
    return
  }

  moveSelectionToRoom(room)
  moveTarget.value = undefined
}

/**
 * Takes the selected faces out of their room.
 */
function removeRoom(): void {
  if (!canUnset.value) {
    return
  }

  moveSelectionToRoom(-1)
}

/**
 * Makes a new room of the selected faces.
 */
function newRoom(): void {
  createRoomWithSelection()
}

/**
 * Puts the focus into the list, so the next `Delete` belongs to the rooms.
 */
function focusList(): void {
  roomsList.value?.focus()
}

/**
 * Takes a room out of the level: its faces stay, and become faces without a room.
 *
 * @param room The room the row stands for.
 */
function removeRowRoom(room: number): void {
  deleteRooms([room])
}
</script>

<template>
  <div class="RoomInspectorWidget">
    <WidgetHeading :label="props.label">
      <template #actions>
        <button
          class="map-toggle"
          :class="{ 'is-on': showsRooms }"
          type="button"
          :disabled="!isMeshVisible"
          :aria-pressed="showsRooms"
          :aria-label="toggleTooltip"
          v-tooltip="toggleTooltip"
          @click="toggleRoomColors()"
        >
          <component :is="showsRooms ? Eye : EyeOff" :size="14" />
        </button>
      </template>
    </WidgetHeading>
    <p class="selection">{{ selectionLabel }}</p>
    <p v-if="roomNamesOnAnotherVersion" class="version-note" role="status">
      Room names of another version of this level are kept, and not shown.
    </p>
    <SearchField v-if="rows.length > 0" v-model="query" placeholder="Search rooms" label="Search rooms" />
    <ul ref="roomList" class="rooms" tabindex="0" @pointerdown="focusList">
      <InspectorRow
        v-for="row in shown"
        :key="row.room"
        class="room"
        :class="{
          'is-selected': selectedRooms.has(row.room),
          'is-hovered': row.room === currentRoom || row.room === hoveredRoom,
        }"
        @click="pick(row.room, $event)"
        @dblclick="startRename(row.room)"
        @mouseenter="hoverRoom(row.room)"
        @mouseleave="hoverRoom(undefined)"
      >
        <ColorSwatch :color="row.color" />
        <span class="name" :class="{ 'is-renaming': renaming === row.room }" v-tooltip="roomTitleOf(row.room)">
          {{ roomLabelOf(row.room) }}
          <template v-if="renaming === row.room">
            ·
            <input
              id="room-name"
              :ref="captureNameField"
              v-model="draft"
              class="rename"
              type="text"
              :placeholder="UNNAMED_ROOM"
              :aria-label="`The name of room ${row.room}`"
              @click.stop
              @dblclick.stop
              @keydown.enter="commitRename"
              @keydown.esc="cancelRename"
              @blur="commitRename"
            />
          </template>
          <template v-else-if="roomNameOf(row.room) !== undefined"> · {{ nameOf(row.room) }}</template>
        </span>
        <span class="count">{{ faceCountLabelOf(row.faceCount) }}</span>
        <RowActionButton
          v-if="row.room !== NO_ROOM"
          :label="`Rename ${roomLabelOf(row.room)}`"
          muted
          @click.stop="startRename(row.room)"
          @dblclick.stop
        >
          <Pencil :size="13" />
        </RowActionButton>
        <RowActionButton
          v-if="row.room !== NO_ROOM"
          :label="`Delete ${roomLabelOf(row.room)}`"
          muted
          danger
          @click.stop="removeRowRoom(row.room)"
        >
          <Trash2 :size="13" />
        </RowActionButton>
      </InspectorRow>
    </ul>
    <EmptyMessage v-if="rows.length > 0 && shown.length === 0">No room matches the search</EmptyMessage>
    <section class="manage">
      <SectionTitle>Manage selection</SectionTitle>
      <div class="moves">
        <button
          type="button"
          class="move"
          :disabled="selected === 0"
          v-tooltip="'Make a new room of the selected faces'"
          @click="newRoom"
        >
          Put into a new room
        </button>
        <span class="or">or</span>
        <div class="move-row">
          <label class="move-label" for="move-target">Move to</label>
          <select id="move-target" v-model="moveTarget" class="move-select" :disabled="selected === 0">
            <option :value="undefined">Pick a room</option>
            <option v-for="row in moveTargets" :key="row.room" :value="row.room">{{ moveLabelOf(row.room) }}</option>
          </select>
          <button
            type="button"
            class="apply"
            :disabled="!canMove"
            v-tooltip="moveTitle"
            aria-label="Move the selection to the room"
            @click="moveToTarget"
          >
            <Check :size="14" />
          </button>
        </div>
        <span class="or">or</span>
        <button type="button" class="move" :disabled="!canUnset" v-tooltip="unsetTitle" @click="removeRoom">
          Unset room data
        </button>
      </div>
    </section>
    <section v-if="problems.length > 0" class="problems">
      <SectionTitle>Warnings</SectionTitle>
      <p v-for="problem in problems" :key="problem.text" class="problem" :class="`is-${problem.kind}`">
        {{ problem.text }}
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The rooms of the level: the list of them, what the selection is in, and the three moves. The list is the part that
// scrolls; the search above it, the moves below it and the problems stay where they are.
.RoomInspectorWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;

  height: 100%;
  padding: 0 8px 8px;
  font-size: 13px;
}

// the switch of the title: the frame and the sizes of the eye of the key help, so the same switch reads the same in
// both places (and the orange eye says the map is on)
.map-toggle {
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

  // only the eye turns orange: the frame stays the neutral border of every button
  &.is-on {
    color: $accent;
  }

  // the map is not drawn without the mesh, so the switch is disabled with it; its state stays as it was left
  &:disabled {
    color: $border;
    cursor: default;
  }
}

// the note of a level whose names belong to another version of its file: the list under it says the rooms without their
// names, and the note says where the names went
.version-note {
  margin: 0;
  padding: 0 6px;
  color: $text-muted;
  font-size: 12px;
  line-height: 1.35;
}

// what the selection is in: the line the three moves speak about
.selection {
  margin: 0;
  padding: 0 6px;
  overflow: hidden;
  color: $text-muted;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// the search field: the glass on the left, the clear button on the right, the frame of the filter of the texture list
.rooms {
  flex: 1;
  min-height: 0;
  // the search above keeps a breath before the list (2026-11-22, the owner: the rows touched the field)
  margin: 20px 0 0;
  padding: 0 10px 0 0;
  overflow-y: auto;
  list-style: none;

  // the rows are a list to click, not text to copy: a drag across them must not leave a selection behind
  user-select: none;

  // the focus of the list is what the Delete of the inspector reads, and a mouse click does not need a ring for it
  &:focus-visible {
    outline: 1px solid $interactive;
    outline-offset: 2px;
  }
}

.room {
  color: $text-muted;

  // the pointer of the author and the room under the crosshair of the walkable view read the same way: one row gets
  // the hover wash while the camera points at its room
  &.is-hovered {
    background: $surface-panel;
  }

  &.is-selected {
    color: $text;
    background: rgba($accent, 0.15);
  }
}

// the field of a row being renamed: it takes the room of the name, and the click on it stays in the field (the row is
// the pick). A name longer than the row is cut with the ellipsis in the list, but the field must be whole: the row of
// the name turns into a flex line, the field takes the rest of it, and the ring of its focus is the whole field (the
// ellipsis of the row would cut the field and its ring, 2026-11-15, the owner's catch)
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

// the color square: the same one the room map paints the room with, so the row and the view read together
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  // the renaming row: the field of the name is a line of its own, so it is not cut by the ellipsis of the row
  &.is-renaming {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: visible;
    white-space: normal;
  }
}

.count {
  color: $text-subtle;
  font-size: 12px;
  white-space: nowrap;
}

// the pencil of a row: a rename without the double click, quiet until the row is under the pointer
// the trash of a row: quiet until the row is under the pointer, then the color of a delete
// the search found no room: the list keeps its place, the line stands in it
// the three things the selection can become, one under the other: a new room, the room of the dropdown, or none. A
// quiet `or` between them says it is one choice, and the dropdown keeps the other two one click away
.moves {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
}

.move {
  height: 22px;
  color: $text;
  font: inherit;
  background: $surface-panel;
  border: 1px solid $border;
  border-radius: 4px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: $surface-raised;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

// the word between the moves: the three are one choice, and a quiet line says so
.or {
  color: $text-subtle;
  font-size: 11px;
  text-align: center;
}

.move-row {
  display: flex;
  align-items: center;
  gap: 6px;

  .move-label {
    color: $text-muted;
    white-space: nowrap;
  }

  .move-select {
    flex: 1;
    min-width: 0;
    height: 22px;
    color: $text;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .apply {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    color: $text;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: $surface-raised;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}

// the two sections under the list (the moves and the warnings) are cut off from it by the same quiet line
.manage {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid $border-dark;
}

.problems {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid $border-dark;
}

.problem {
  margin: 0;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.35;

  // the line the author has to fix reads in the warning color, the one that explains the level stays quiet
  &.is-warning {
    color: $accent;
  }

  &.is-info {
    color: $text-subtle;
  }
}
</style>
