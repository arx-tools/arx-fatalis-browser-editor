<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import {
  createRoomWithSelection,
  moveSelectionToRoom,
  nextRoomIdOf,
  roomTargetsOf,
  type RoomTarget,
} from '../../../modules/rooms/roomMapper.ts'
import { roomsOfFaces } from '../../../modules/rooms/roomSelection.ts'
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
 * The rooms of the level, with the number of their faces.
 *
 * @remarks
 * The room of a face is written **in place**, so the level itself is not a signal of it: the revision of the level is
 * (an edit bumps it), and the panel reads the level when it moves.
 */
const targets = shallowRef<readonly RoomTarget[]>([])

/**
 * The room the move writes.
 */
const target = ref<number | undefined>(undefined)

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
 * What the panel says about the rooms of the selection.
 */
const selectionLabel = computed(() => {
  if (selected.value === 0) {
    return 'No faces are selected'
  }

  const found = [...rooms.value].filter((room) => {
    return room >= 0
  })

  if (found.length === 0) {
    return `${String(selected.value)} face(s) without a room`
  }

  if (found.length === 1) {
    return `${String(selected.value)} face(s) in room ${String(found[0])}`
  }

  return `${String(selected.value)} face(s) in ${String(found.length)} rooms`
})

/**
 * Whether the move has where to go.
 */
const canMove = computed(() => {
  return selected.value > 0 && target.value !== undefined
})

/**
 * The id a new room would take.
 */
const nextRoom = ref<number | undefined>(undefined)

/**
 * Reads the rooms of the level again.
 *
 * @remarks
 * The panel follows the level (a load, an edit that moves faces) and the selection, which is the input of the moves.
 */
function readRooms(): void {
  const level = levelStore.map.value

  if (level === undefined) {
    targets.value = []
    rooms.value = new Set()
    nextRoom.value = undefined

    return
  }

  targets.value = roomTargetsOf(level)
  rooms.value = roomsOfFaces(level, selectionStore.polygons.value)
  nextRoom.value = nextRoomIdOf(level)
}

watch(
  [
    levelRevision,
    levelStore.map,
    (): ReadonlySet<number> => {
      return selectionStore.polygons.value
    },
  ],
  readRooms,
  { immediate: true },
)

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
    <div class="field">
      <label for="room-mapper-target">Room</label>
      <select id="room-mapper-target" v-model="target">
        <option :value="undefined">Pick a room</option>
        <option v-for="row in targets" :key="row.room" :value="row.room">
          room {{ row.room }} ({{ row.faceCount }} faces)
        </option>
      </select>
    </div>
    <div class="buttons">
      <button type="button" :disabled="!canMove" @click="move">Move selection to room</button>
      <button type="button" :disabled="selected === 0" @click="remove">Remove from room</button>
      <button type="button" :disabled="nextRoom === undefined || selected === 0" @click="newRoom">New room</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

// The faces of the selection into a room: the count of the selection, the target room, and the three moves. The panel
// reads the selection and writes the room of its faces as one step of the history, so the undo takes it back.
.RoomMapperWidget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  padding: 8px;
  font-size: 13px;
}

.selection {
  margin: 0;
  padding: 0 6px;
  color: $text-muted;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    color: $text-muted;
  }

  select {
    height: 22px;
    color: $text;
    font: inherit;
    background: $surface-panel;
    border: 1px solid $border;
    border-radius: 4px;
  }
}

.buttons {
  display: flex;
  flex-direction: column;
  gap: 4px;

  button {
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
