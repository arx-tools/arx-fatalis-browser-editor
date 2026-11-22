<script setup lang="ts">
import { ScanSearch } from 'lucide-vue-next'
import { computed, reactive, shallowRef, watch } from 'vue'
import EmptyMessage from '../../EmptyMessage.vue'
import SearchField from '../../SearchField.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import AccordionRow from '../../AccordionRow.vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { worldPositionToGame } from '../camera/cameraPose.ts'
import { jumpPoseOf } from '../camera/jumpPose.ts'
import {
  ENTITY_JUMP_DISTANCE,
  entityRowsOf,
  entitySectionsOf,
  searchRows,
  type EntityCategory,
  type EntityRow,
} from '../../../modules/level/entities/entityRows.ts'

/**
 * The entities of the level, from the DLF.
 *
 * @remarks
 * The list is the read of the DLF's interactive objects (TODO 239, the first slice): the categories are the first
 * segment of the name of an object (`fix_inter`, `items`, `npc`, `player`, `system`), and the search reads the name and
 * the identifier. The rows are read only: the pick and the transform of an entity come with TODO 240.
 */
const props = defineProps<{
  /**
   * The label of the widget, from the widget definition.
   */
  readonly label: string
}>()

/**
 * The entities of the level, in the order the list shows them.
 */
const rows = shallowRef<readonly EntityRow[]>([])

/**
 * The text of the search field.
 */
const query = shallowRef('')

/**
 * The sections that are open, by their category.
 *
 * @remarks
 * All of them start **closed** (2026-11-22, the owner): a level of the game holds hundreds of entities, and the list
 * reads as the five folders until the author opens one or types into the search (a search opens every section, so the
 * rows it found are on the screen).
 */
const openSections = reactive(new Set<EntityCategory>())

/**
 * Tells whether the rows of a category are shown.
 *
 * @param category The category to read.
 *
 * @returns True while the section is open.
 */
function isSectionOpen(category: EntityCategory): boolean {
  // a search shows what it found: the author typed to see the rows, so the sections open while the field has text
  if (query.value.trim() !== '') {
    return true
  }

  return openSections.has(category)
}

/**
 * Opens or closes the rows of a category.
 *
 * @param category The category to flip.
 */
function toggleSection(category: EntityCategory): void {
  if (openSections.has(category)) {
    openSections.delete(category)

    return
  }

  openSections.add(category)
}

/**
 * The rows the search lets through.
 */
const shown = computed(() => {
  return searchRows(rows.value, query.value)
})

/**
 * The sections of the list: one per category the shown rows hold.
 */
const sections = computed(() => {
  return entitySectionsOf(shown.value)
})

/**
 * Moves the camera to an entity.
 *
 * @remarks
 * The jump keeps the orientation the camera has, so the entity lands in the middle of the view (the way the light
 * inspector jumps, 2026-11-22, the owner). The camera of the view is the only one: the fixed views frame the whole level.
 *
 * @param row The row of the list.
 */
function jumpTo(row: EntityRow): void {
  const pose = cameraStore.pose.value
  const map = levelStore.map.value

  if (pose === undefined || map === undefined) {
    return
  }

  // the DLF position of an entity is the local space of the level, which is where the spike draws the door of level 0
  // (the map is `M(v - scenePosition)`), and the camera's pose is the game's own space: the way back is the inverse of
  // the one the view applies (2026-11-22, the owner: the jump of the rows went out of the level)
  const target = worldPositionToGame(arxVector3toVector3(row.position), map.scenePosition)

  cameraStore.moveCamera(jumpPoseOf(pose, target, ENTITY_JUMP_DISTANCE))
}

/**
 * Reads the entities of the level into the list.
 */
function rebuild(): void {
  const map = levelStore.map.value

  if (map === undefined) {
    rows.value = []

    return
  }

  rows.value = entityRowsOf(map)
}

watch(levelStore.map, rebuild, { immediate: true })
</script>

<template>
  <div class="EntityListWidget">
    <WidgetHeading :label="props.label">
      <template #actions>
        <span class="total">Total: {{ rows.length }}</span>
      </template>
    </WidgetHeading>
    <SearchField v-if="rows.length > 0" v-model="query" placeholder="Search entities" label="Search entities" />
    <div v-if="rows.length > 0 && shown.length > 0" class="sections">
      <AccordionRow
        v-for="(section, index) in sections"
        :key="section.category"
        :label="section.label"
        :value="String(section.rows.length)"
        :stripe="index % 2 === 1"
        :empty="section.rows.length === 0"
        :open="isSectionOpen(section.category)"
        @toggle="toggleSection(section.category)"
      >
        <ul class="rows">
          <li v-for="row in section.rows" :key="row.index" class="row">
            <span class="name">{{ row.entityName }}</span>
            <button
              class="jump"
              type="button"
              :aria-label="`Jump to entity ${row.entityName}`"
              v-tooltip="`Jump to entity ${row.entityName}`"
              @click="jumpTo(row)"
            >
              <ScanSearch :size="13" />
            </button>
          </li>
        </ul>
      </AccordionRow>
    </div>
    <EmptyMessage v-if="rows.length === 0">This level has no entities.</EmptyMessage>
    <EmptyMessage v-else-if="shown.length === 0">No entity matches the search.</EmptyMessage>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.EntityListWidget {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 8px 8px;
  overflow: hidden;

  // the count of the level sits in the heading, on the right, where a widget keeps its action: the list has none, and
  // the total is the number the author opens it for (2026-11-22, the owner)
  .total {
    color: $text-muted;
    font-size: 11px;
  }

  .sections {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    margin-top: 20px;
    // the rows stop before the scrollbar, the way the rows of the group inspector do: the bar takes the right edge
    padding: 0 10px 0 0;
    overflow-y: auto;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 2px 0 0 4px;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 6px;
    border-radius: 3px;

    &:nth-child(even) {
      background-color: rgba($surface-panel, 0.45);
    }

    .name {
      flex: 1;
      overflow: hidden;
      color: $text;
      font-size: 12px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    // the jump sits at the end of the row, the way the light inspector keeps it
    .jump {
      flex: none;
      padding: 0;
      color: $text-muted;
      background: transparent;
      border: 0;
      cursor: pointer;

      &:hover {
        color: $text-strong;
      }
    }
  }
}
</style>
