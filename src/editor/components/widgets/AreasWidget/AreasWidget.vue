<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { crosshairStore } from '../../../modules/crosshair/crosshairStore.ts'
import { formatCount } from '../../../modules/format.ts'
import { levelRevision } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { currentMapId } from '../../../modules/level/source/maps.ts'
import { selectedRoom, selectRoom } from '../../../modules/rooms/roomStore.ts'
import { isRoomColorsVisible } from '../shared/levelDisplay.ts'
import WidgetHeading from '../../WidgetHeading.vue'
import { areaProblemsOf, areaRowsOf, roomUnderCrosshairOf, type AreaProblem, type AreaRow } from './areas.ts'

/**
 * The label of the widget, from the widget definition.
 */
const props = defineProps<{
  readonly label: string
}>()

/**
 * The rooms of the level, with the colour the room map paints them with.
 */
const rows = shallowRef<AreaRow[]>([])

/**
 * What the author can not see in the view: the faces without a room, and the level that is one area.
 */
const problems = shallowRef<AreaProblem[]>([])

/**
 * The room of the face under the crosshair of the walkable view.
 *
 * @remarks
 * It reads the crosshair store, so it follows the view: the panel says which area the player stands in while the
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

  rows.value = areaRowsOf(map, currentMapId.value)
  problems.value = areaProblemsOf(map)
}

watch(
  [levelStore.map, levelRevision, currentMapId],
  () => {
    rebuild()
  },
  { immediate: true },
)

// the picked room is an id of a level: another level has other ids, so the pick does not survive it
watch(levelStore.map, () => {
  selectRoom(undefined)
})

/**
 * Picks a room, shows the room map, or clears the pick when the picked room is clicked again.
 *
 * @remarks
 * The highlight is the room map dimming the other rooms, so a pick with the textures on would do nothing visible. The
 * author who clicks a room wants to see it, so the map comes on with the pick (the switch stays his to turn off), and a
 * second click on the same row clears the dim.
 *
 * @param room The room the row stands for.
 */
function pick(room: number): void {
  if (selectedRoom.value === room) {
    selectRoom(undefined)

    return
  }

  selectRoom(room)
  isRoomColorsVisible.value = true
}
</script>

<template>
  <div class="AreasWidget">
    <WidgetHeading :label="props.label" />
    <p class="here">
      <template v-if="here !== undefined"
        >You are in: <b>Room {{ here }}</b></template
      >
      <template v-else>No face under the crosshair</template>
    </p>
    <ul class="rooms">
      <li
        v-for="row in rows"
        :key="row.room"
        class="room"
        :class="{ 'is-selected': row.room === selectedRoom }"
        @click="pick(row.room)"
      >
        <span class="swatch" :style="{ backgroundColor: row.color }"></span>
        <span class="name">Room {{ row.room }}</span>
        <span class="count">{{ formatCount(row.faceCount) }}</span>
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

// The rooms of the level: the area the player stands in, the list of them, and what is wrong with them. The list is
// the part that scrolls; the line above it and the problems below it stay where they are.
.AreasWidget {
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

  &:hover {
    background: $surface-panel;
  }

  &.is-selected {
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
}

.count {
  color: $text-subtle;
  font-size: 12px;
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
