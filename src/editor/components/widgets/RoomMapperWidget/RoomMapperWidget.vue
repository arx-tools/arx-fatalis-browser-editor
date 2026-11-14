<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { computed, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { faceCountLabelOf, filteredRoomRows, roomRowsOf, type RoomRow } from '../../../modules/rooms/roomList.ts'
import { createRoomWithSelection, moveSelectionToRoom, nextRoomIdOf } from '../../../modules/rooms/roomMapper.ts'
import { nameOf, roomNameOf } from '../../../modules/rooms/roomNames.ts'
import { roomsOfFaces } from '../../../modules/rooms/roomSelection.ts'
import { hoveredRoom, hoverRoom } from '../../../modules/rooms/roomStore.ts'
import { currentRoom } from '../../../modules/rooms/roomUnderCrosshair.ts'
import { selectionStore } from '../../../modules/selection/selectionStore.ts'
import WidgetHeading from '../../WidgetHeading.vue'

/**
 * The heading the shell gives the widget.
 */
const props = defineProps<{
  /**
   * The label of the heading.
   */
  readonly label: string
}>()

/**
 * The rooms of the level, with the colour the room map paints them with.
 *
 * @remarks
 * The room of a face is written **in place**, so the level itself is not a signal of it: the revision of the level is
 * (an edit bumps it), and the panel reads the level when it moves. The rows are the same ones the room inspector lists
 * (`modules/rooms/roomList.ts`), so the target of a move and the row of the room read the same colour and count.
 */
const rows = shallowRef<readonly RoomRow[]>([])

/**
 * The room the move writes: the row of the list the author picked.
 */
const target = ref<number | undefined>(undefined)

/**
 * What the author typed into the search field.
 */
const query = ref('')

/**
 * The search field, so the clear button can put the focus back on it.
 */
const searchField = useTemplateRef<HTMLInputElement>('searchField')

/**
 * The rooms the search lets through: the list the author picks the target from.
 */
const shown = computed<readonly RoomRow[]>(() => {
  return filteredRoomRows(rows.value, query.value)
})

/**
 * The rooms the selected faces are in, as the room of a face is: `-1` is a face without a room.
 */
const rooms = shallowRef<ReadonlySet<number>>(new Set())

/**
 * How many faces are selected.
 */
const selected = computed(() => {
  return selectionStore.polygons.value.size
})

/**
 * The rooms of the selection, without the faces that have none.
 */
const foundRooms = computed<readonly number[]>(() => {
  return [...rooms.value].filter((room) => {
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
 * Whether the selected faces are in the target room already.
 *
 * @remarks
 * The move would be a step of the history that writes the same room on every face, so the button stays off: a list to
 * pick the target from makes the room of the selection a click away, and an undo step of nothing is only noise.
 */
const isAlreadyThere = computed(() => {
  return target.value !== undefined && rooms.value.size === 1 && rooms.value.has(target.value)
})

/**
 * Whether the move has where to go.
 */
const canMove = computed(() => {
  return selected.value > 0 && target.value !== undefined && !isAlreadyThere.value
})

/**
 * Whether a selected face is in a room to be taken out of.
 *
 * @remarks
 * A face without a room is already out, so a selection of only such faces leaves the button off: the step would write the
 * room the faces have back.
 */
const canRemove = computed(() => {
  return selected.value > 0 && foundRooms.value.length > 0
})

/**
 * What the move button explains about itself.
 */
const moveTitle = computed(() => {
  if (selected.value === 0) {
    return 'Select the faces to move first'
  }

  if (target.value === undefined) {
    return 'Pick a room from the list'
  }

  if (isAlreadyThere.value) {
    return 'The selected faces are in this room already'
  }

  return `Move the selected faces into room ${String(target.value)}`
})

/**
 * The id a new room would take.
 */
const nextRoom = ref<number | undefined>(undefined)

/**
 * Reads the rooms of the level again.
 *
 * @remarks
 * The panel follows the level (a load, an edit that moves faces) and the selection, which is the input of the moves. The
 * target is an id of the level: a room the level no longer has a face in is not a room to move into, so the target is
 * dropped with it.
 */
function readRooms(): void {
  const level = levelStore.map.value

  if (level === undefined) {
    rows.value = []
    rooms.value = new Set()
    nextRoom.value = undefined
    target.value = undefined

    return
  }

  rows.value = roomRowsOf(level, currentMapId.value)
  rooms.value = roomsOfFaces(level, selectionStore.polygons.value)
  nextRoom.value = nextRoomIdOf(level)

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
    levelRevision,
    levelStore.map,
    currentMapId,
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
  ],
  readRooms,
  { immediate: true },
)

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
 * Picks the row of the list as the room the move writes.
 *
 * @param room The id of the room.
 */
function pickTarget(room: number): void {
  target.value = room
}

/**
 * Moves the selected faces into the picked room.
 */
function move(): void {
  if (target.value === undefined) {
    return
  }

  moveSelectionToRoom(target.value)
}

/**
 * Takes the selected faces out of their room.
 */
function remove(): void {
  moveSelectionToRoom(-1)
}

/**
 * Makes a new room of the selection, and picks it as the next target.
 */
function newRoom(): void {
  const room = createRoomWithSelection()

  if (room !== undefined) {
    target.value = room
  }
}
</script>

<template>
  <div class="RoomMapperWidget">
    <WidgetHeading :label="props.label" />
    <p class="selection">{{ selectionLabel }}</p>
    <label class="search">
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
          'is-target': row.room === target,
          'is-hovered': row.room === currentRoom || row.room === hoveredRoom,
        }"
        @click="pickTarget(row.room)"
        @mouseenter="hoverRoom(row.room)"
        @mouseleave="hoverRoom(undefined)"
      >
        <span class="swatch" :style="{ backgroundColor: row.color }"></span>
        <span class="name" :title="nameOf(row.room)">
          room {{ row.room }}<template v-if="roomNameOf(row.room) !== undefined"> · {{ nameOf(row.room) }}</template>
        </span>
        <span class="count">{{ faceCountLabelOf(row.faceCount) }}</span>
      </li>
    </ul>
    <p v-if="rows.length > 0 && shown.length === 0" class="empty">No room matches the search</p>
    <div class="buttons">
      <button type="button" :disabled="!canMove" :title="moveTitle" @click="move">Move</button>
      <button type="button" :disabled="!canRemove" title="Take the selected faces out of their room" @click="remove">
        Remove
      </button>
      <button
        type="button"
        :disabled="nextRoom === undefined || selected === 0"
        title="Make a new room of the selected faces"
        @click="newRoom"
      >
        New room
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The faces of the selection into a room: the count of the selection, the rooms to move them into, and the three moves.
// The list is the target of the move (a search narrows it), and the panel reads the selection and writes the room of its
// faces as one step of the history, so the undo takes it back.
.RoomMapperWidget {
  display: flex;
  flex-direction: column;
  gap: 6px;
  height: 100%;
  padding: 8px;
  font-size: 13px;
}

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

// the rooms to move into: the same rows the room inspector lists, so a room reads the same in both panels. The list is
// the part that scrolls; the search above it and the moves below it stay where they are.
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
  padding: 2px 6px;
  color: $text-muted;
  cursor: pointer;

  // a very faint stripe, the same as the information lists of the other widgets: a long list of rooms is easier to
  // follow when the rows alternate, and the target and the hover stay readable over it
  &:nth-child(even) {
    background: rgba($text-strong, 0.03);
  }

  // the pointer of the author and the room under the crosshair of the walkable view read the same way: one row gets
  // the hover wash while the pointer or the camera points at its room
  &:hover,
  &.is-hovered {
    background: $surface-panel;
  }

  // the room the move writes: the one row the move button speaks about
  &.is-target {
    color: $text;
    background: rgba($accent, 0.15);
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

// the three moves, in one row under the list: the list is the target, and the buttons say what to do with it
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
</style>
