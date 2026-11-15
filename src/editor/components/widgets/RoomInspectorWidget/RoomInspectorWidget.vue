<script setup lang="ts">
import { Eye, EyeOff, Search, X } from 'lucide-vue-next'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { faceCountLabelOf, filteredRoomRows, roomRowsOf, type RoomRow } from '../../../modules/rooms/roomList.ts'
import { createRoomWithSelection, moveSelectionToRoom } from '../../../modules/rooms/roomMapper.ts'
import { nameOf, renameRoom, roomNameOf, UNNAMED_ROOM } from '../../../modules/rooms/roomNames.ts'
import { pickRoom, roomsOfFaces } from '../../../modules/rooms/roomSelection.ts'
import { clearRoomHover, hoveredRoom, hoverRoom, selectedRooms, selectRoom } from '../../../modules/rooms/roomStore.ts'
import { currentRoom } from '../../../modules/rooms/roomUnderCrosshair.ts'
import { selectionModeOf, selectionStore } from '../../../modules/selection/selectionStore.ts'
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
 * The rooms of the level, with the colour the room map paints them with.
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
 * buttons act on it. The rooms are read here, so the move-to row and the label read the same state.
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
 * The search field, so the clear button can put the focus back on it.
 */
const searchField = useTemplateRef<HTMLInputElement>('searchField')

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
 * Whether the panel is in the mode where a click on a row picks the target of the move.
 *
 * @remarks
 * The three buttons of the panel are the moves of the selection; the move needs a room to go to, and the list is where
 * that room is picked. The mode is the panel's own: the row click picks the room (and not the faces, which are the
 * selection the move writes), and the row it picked is the one the readonly target field says.
 */
const movingTo = shallowRef(false)

/**
 * The room the move writes, when the panel is in the move-to mode.
 */
const target = shallowRef<number | undefined>(undefined)

/**
 * What the target field says: the room of the move, or `-` while none is picked.
 */
const targetLabel = computed(() => {
  const room = target.value

  if (room === undefined) {
    return '-'
  }

  const name = roomNameOf(room)

  if (name === undefined) {
    return `room ${room}`
  }

  return `room ${room} · ${name}`
})

/**
 * Whether the selected faces are in the target room already.
 *
 * @remarks
 * The move would be a step of the history that writes the same room on every face, so the submit stays off: a list to
 * pick the target from makes the room of the selection a click away, and an undo step of nothing is only noise.
 */
const isAlreadyThere = computed(() => {
  return target.value !== undefined && selectionRooms.value.size === 1 && selectionRooms.value.has(target.value)
})

/**
 * Whether the move has where to go: a target room, a selection, and not the room the faces are in already.
 */
const canSubmitMove = computed(() => {
  return target.value !== undefined && selected.value > 0 && !isAlreadyThere.value
})

/**
 * What the submit button explains about itself.
 */
const submitTitle = computed(() => {
  if (target.value === undefined) {
    return 'Pick a room from the list first'
  }

  if (isAlreadyThere.value) {
    return 'The selected faces are in this room already'
  }

  return `Move the selected faces into room ${String(target.value)}`
})

/**
 * Reads the rooms, the problems and the rooms of the selection again.
 *
 * @remarks
 * The level and its revision are the signal: a load replaces the rooms, an edit moves the faces between them. The id of
 * the map is watched as well, because the colours are keyed with it, and the id of a zip arrives after the level. The
 * selection is watched too: the label and the moves follow it.
 */
function rebuild(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    rows.value = []
    problems.value = []
    selectionRooms.value = new Set()
    target.value = undefined

    return
  }

  rows.value = roomRowsOf(map, currentMapId.value)
  problems.value = roomProblemsOf(map)
  selectionRooms.value = roomsOfFaces(map, selectionStore.polygons.value)

  const picked = target.value

  if (
    picked !== undefined &&
    rows.value.every((row) => {
      return row.room !== picked
    })
  ) {
    target.value = undefined
  }
}

watch(
  [
    levelStore.map,
    levelRevision,
    currentMapId,
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
 * Empties the search field, and leaves the focus on it.
 *
 * @remarks
 * The clear button is the end of the field: the pointer is already there, and the next word is typed right away.
 */
function clearSearch(): void {
  query.value = ''
  searchField.value?.focus()
}

/**
 * Selects the whole text of the search field when it takes the focus.
 *
 * @remarks
 * A filter is typed over: the author wants the next word to replace the one that is there, and a click that leaves the
 * caret in the middle of the word makes that a delete of half of it. The selection puts the whole word in the field,
 * ready to be typed over (2026-11-12, the owner).
 *
 * @param event The focus of the field.
 */
function selectAllOf(event: FocusEvent): void {
  const field = event.currentTarget

  if (field instanceof HTMLInputElement) {
    field.select()
  }
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
  // the rename is not a part of the move: the clicks of the double click pick the target, the name is edited after it
  if (movingTo.value) {
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
    renameRoom(room, draft.value)
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
 * In the move-to mode the click is the target of the move instead: the faces of the selection stay the ones the move
 * writes.
 *
 * @param room The room the row stands for.
 * @param event The click, whose modifiers decide what the row does with the selection.
 */
function pick(room: number, event: MouseEvent): void {
  if (movingTo.value) {
    target.value = room

    return
  }

  const mode = selectionModeOf(event)

  if (mode === 'replace' && isPicked(room)) {
    pickRoom(undefined)

    return
  }

  pickRoom(room, mode)
}

/**
 * Enters the mode where a click on a row picks the room the selection moves into.
 */
function startMovingTo(): void {
  movingTo.value = true
  target.value = undefined
}

/**
 * Leaves the move-to mode without moving the faces.
 */
function cancelMovingTo(): void {
  movingTo.value = false
  target.value = undefined
}

/**
 * Moves the selected faces into the target room, and leaves the move-to mode.
 */
function moveToTarget(): void {
  const room = target.value

  if (room === undefined) {
    return
  }

  moveSelectionToRoom(room)

  movingTo.value = false
  target.value = undefined
}

/**
 * Takes the selected faces out of their room.
 */
function removeRoom(): void {
  moveSelectionToRoom(-1)
}

/**
 * Makes a new room of the selected faces.
 */
function newRoom(): void {
  createRoomWithSelection()
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
    <label v-if="rows.length > 0" class="search">
      <Search :size="12" class="icon" />
      <input
        ref="searchField"
        v-model="query"
        type="search"
        placeholder="Search rooms"
        aria-label="Search rooms"
        @focus="selectAllOf"
      />
      <button
        v-if="query !== ''"
        class="clear"
        type="button"
        aria-label="Empty the search"
        @click.prevent="clearSearch"
      >
        <X :size="12" />
      </button>
    </label>
    <ul class="rooms">
      <li
        v-for="row in shown"
        :key="row.room"
        class="room"
        :class="{
          'is-selected': selectedRooms.has(row.room),
          'is-hovered': row.room === currentRoom || row.room === hoveredRoom,
          'is-target': row.room === target,
        }"
        @click="pick(row.room, $event)"
        @dblclick="startRename(row.room)"
        @mouseenter="hoverRoom(row.room)"
        @mouseleave="hoverRoom(undefined)"
      >
        <span class="swatch" :style="{ backgroundColor: row.color }"></span>
        <span class="name" :class="{ 'is-renaming': renaming === row.room }" :title="nameOf(row.room)">
          room {{ row.room }}
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
      </li>
    </ul>
    <p v-if="rows.length > 0 && shown.length === 0" class="empty">No room matches the search</p>
    <div v-if="!movingTo" class="buttons">
      <button
        type="button"
        :disabled="selected === 0"
        title="Move the selected faces into another room"
        @click="startMovingTo"
      >
        Move to...
      </button>
      <button
        type="button"
        :disabled="selected === 0"
        title="Take the selected faces out of their room"
        @click="removeRoom"
      >
        Remove room
      </button>
      <button type="button" :disabled="selected === 0" title="Make a new room of the selected faces" @click="newRoom">
        New room
      </button>
    </div>
    <div v-else class="move-to">
      <label class="target">
        <span>Target:</span>
        <input class="target-field" type="text" readonly :value="targetLabel" />
      </label>
      <div class="buttons">
        <button type="button" :disabled="!canSubmitMove" :title="submitTitle" @click="moveToTarget">
          Move selection to target
        </button>
        <button type="button" title="Leave the move without moving the faces" @click="cancelMovingTo">Cancel</button>
      </div>
    </div>
    <section v-if="problems.length > 0" class="problems">
      <h3 class="title">Problems</h3>
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
  padding: 8px;
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
.search {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;

  .icon {
    position: absolute;
    left: 6px;
    color: $text-subtle;
    pointer-events: none;
  }

  // the browser draws its own clear button for a search field, and it would sit next to the one of the widget: the one
  // of the widget is the button of every browser
  input::-webkit-search-cancel-button,
  input::-webkit-search-decoration {
    appearance: none;
  }

  // the clear button of the field: the quiet grey of an icon, the bright text under the pointer
  .clear {
    position: absolute;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    color: $text-subtle;
    background: none;
    border: 0;
    cursor: pointer;

    &:hover {
      color: $text;
    }
  }

  input {
    box-sizing: border-box;
    width: 100%;
    // the room of the two icons of the field: the glass on the left, the clear button on the right
    padding: 3px 22px 3px 22px;
    color: $text;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border-dark;
    border-radius: 4px;

    &:focus {
      border-color: $interactive;
      outline: 1px solid $interactive;
    }
  }
}

.rooms {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;

  // the rows are a list to click, not text to copy: a drag across them must not leave a selection behind
  user-select: none;
}

.room {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  color: $text-muted;
  cursor: pointer;

  // a very faint stripe, the same as the information lists of the other widgets: a long list of rooms is easier to
  // follow when the rows alternate, and the pick and the hover stay readable over it
  &:nth-child(even) {
    background: rgba($text-strong, 0.03);
  }

  // the pointer of the author and the room under the crosshair of the walkable view read the same way: one row gets
  // the hover wash while the camera points at its room
  &:hover,
  &.is-hovered {
    background: $surface-panel;
  }

  &.is-selected {
    color: $text;
    background: rgba($accent, 0.15);
  }

  // the room the move writes: the one row the move speaks about
  &.is-target {
    color: $text;
    box-shadow: inset 2px 0 0 $accent;
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

// the colour square: the same one the room map paints the room with, so the row and the view read together
.swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

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

// the search found no room: the list keeps its place, the line stands in it
.empty {
  margin: 0;
  padding: 0 6px;
  color: $text-subtle;
  font-size: 12px;
}

// the three moves, in one row under the list, and the two buttons of the move-to mode: the list is the target, and the
// buttons say what to do with it
.buttons {
  display: flex;
  flex: none;
  gap: 4px;

  button {
    flex: 1;
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
}

// the move-to mode: the label and the room of the move, and the two buttons under it
.move-to {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
}

.target {
  display: flex;
  align-items: center;
  gap: 6px;

  span {
    color: $text-muted;
    white-space: nowrap;
  }

  .target-field {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 4px;
    color: $text;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border-dark;
    border-radius: 4px;
  }
}

.problems {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid $border-dark;
}

.title {
  margin: 0 0 4px;
  padding: 0 6px;
  color: $text-icon;
  font-size: 11px;
  font-weight: normal;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.problem {
  margin: 0;
  padding: 2px 6px;
  font-size: 12px;
  line-height: 1.35;

  // the line the author has to fix reads in the warning colour, the one that explains the level stays quiet
  &.is-warning {
    color: $accent;
  }

  &.is-info {
    color: $text-subtle;
  }
}
</style>
