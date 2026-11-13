<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'
import { computed, shallowRef, watch } from 'vue'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import {
  checkedRooms,
  clearRoomHighlight,
  hoverRoom,
  selectedRooms,
  selectRoom,
  toggleCheckedRoom,
} from '../../../modules/rooms/roomStore.ts'
import { pickRoom } from '../../../modules/rooms/roomSelection.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { isMeshVisible, isRoomColorsVisible, toggleRoomColors } from '../shared/levelDisplay.ts'
import {
  faceCountLabelOf,
  roomProblemsOf,
  roomRowsOf,
  roomUnderCrosshairOf,
  type RoomProblem,
  type RoomRow,
} from './roomInspector.ts'

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
 * The room of the face under the crosshair of the walkable view.
 *
 * @remarks
 * It reads the crosshair store, so it follows the view: the panel says which room the player stands in while the
 * camera moves and the crosshair picks another face.
 */
const here = computed(() => {
  return roomUnderCrosshairOf(levelStore.map.value, crosshairStore.polygon.value)
})

/**
 * Reads the rooms and the problems of the level again.
 *
 * @remarks
 * The level and its revision are the signal: a load replaces the rooms, an edit moves the faces between them. The id of
 * the map is watched as well, because the colours are keyed with it, and the id of a zip arrives after the level.
 */
function rebuild(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    rows.value = []
    problems.value = []

    return
  }

  rows.value = roomRowsOf(map, currentMapId.value)
  problems.value = roomProblemsOf(map)
}

watch(
  [levelStore.map, levelRevision, currentMapId],
  () => {
    rebuild()
  },
  { immediate: true },
)

// the picked room is an id of a level: another level has other ids, so the pick, the checkboxes and the hover do not
// survive it
watch(levelStore.map, () => {
  selectRoom(undefined)
  clearRoomHighlight()
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
 * Picks a room, shows the room map, or clears the pick when the picked room is clicked again.
 *
 * @remarks
 * The pick is a face selection (`roomSelection.ts`): the room lights up and its faces arrive selected, so the same
 * gesture that shows the room is the one that makes it the working set. The author who clicks a room wants to see it,
 * so the map comes on with the pick (the switch stays his to turn off), and a second click on the same row clears the
 * pick and the selection with it.
 *
 * @param room The room the row stands for.
 */
function pick(room: number): void {
  if (isPicked(room)) {
    pickRoom(undefined)

    return
  }

  pickRoom(room)
  isRoomColorsVisible.value = true
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
    <p class="here">
      <template v-if="here !== undefined"
        >You are pointing to a face in <b>room {{ here }}</b></template
      >
      <template v-else>No face under the crosshair</template>
    </p>
    <ul class="rooms">
      <li
        v-for="row in rows"
        :key="row.room"
        class="room"
        :class="{ 'is-selected': selectedRooms.has(row.room), 'is-checked': checkedRooms.has(row.room) }"
        @click="pick(row.room)"
        @mouseenter="hoverRoom(row.room)"
        @mouseleave="hoverRoom(undefined)"
      >
        <input
          class="checkbox"
          type="checkbox"
          :checked="checkedRooms.has(row.room)"
          :aria-label="`Highlight room ${String(row.room)}`"
          @click.stop="toggleCheckedRoom(row.room)"
        />
        <span class="swatch" :style="{ backgroundColor: row.color }"></span>
        <span class="name">room {{ row.room }}</span>
        <span class="count">{{ faceCountLabelOf(row.faceCount) }}</span>
      </li>
    </ul>
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

// The rooms of the level: the room the player stands in, the list of them, and what is wrong with them. The list is
// the part that scrolls; the line above it and the problems below it stay where they are.
.RoomInspectorWidget {
  display: flex;
  flex-direction: column;

  height: 100%;
  padding: 8px;
  font-size: 13px;
}

.here {
  margin: 0 0 6px;
  padding: 0 6px;
  color: $text-muted;

  b {
    color: $text;
    font-weight: normal;
  }
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

.rooms {
  flex: 1;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
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

  &:hover {
    background: $surface-panel;
  }

  &.is-selected {
    color: $text;
    background: rgba($accent, 0.15);
  }

  // a checkbox is a highlight of the map, not a selection of faces: a fainter wash says the two apart
  &.is-checked {
    color: $text;
    background: rgba($accent, 0.07);
  }
}

// the checkbox of the row: the room map lights the rooms it holds, the selection is the row click
.checkbox {
  flex: none;
  width: 11px;
  height: 11px;
  margin: 0;
  accent-color: $accent;
  cursor: pointer;
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
}

.count {
  color: $text-subtle;
  font-size: 12px;
  white-space: nowrap;
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
