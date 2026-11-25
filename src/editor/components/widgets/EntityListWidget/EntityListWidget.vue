<script setup lang="ts">
import { ScanSearch } from 'lucide-vue-next'
import { computed, nextTick, onMounted, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import EmptyMessage from '../../EmptyMessage.vue'
import SearchField from '../../SearchField.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import AccordionRow from '../../AccordionRow.vue'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { arxVector3toVector3 } from '../../../../generator/meshes.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { worldPositionToGame } from '../camera/cameraPose.ts'
import { jumpPoseOf } from '../camera/jumpPose.ts'
import { entitySelectionStore } from '../../../modules/selection/entitySelectionStore.ts'
import { isPlayerSelected, playerSpawnOf } from '../../../modules/level/entities/playerSpawn.ts'
import { createRevealGate, revealRowIn } from '../shared/revealRow.ts'
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
 * The gate of the reveal: a click in this list does not move it.
 */
const revealGate = createRevealGate()

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
 * Picks the entity of a row in the view, or lets it go.
 *
 * @remarks
 * The selection is the index of the entity in the DLF list, the same one the markers of the walkable view write: a click
 * on the row and a pick of the crosshair are the two doors of one selection (2026-11-24, the owner).
 *
 * @param row The row of the list.
 */
function selectRow(row: EntityRow): void {
  const selected = entitySelectionStore.entity.value === row.index

  revealGate.suppress()

  if (selected) {
    entitySelectionStore.clear()

    return
  }

  entitySelectionStore.select(row.index)
}

/**
 * Moves the camera to the spawn of the player.
 *
 * @remarks
 * The spawn is not an entity of the DLF: it is the `player` of the header, and the row of the list jumps to it the way
 * the rows of the entities do (the camera keeps its own orientation).
 */
function jumpToPlayer(): void {
  const pose = cameraStore.pose.value
  const map = levelStore.map.value

  if (pose === undefined || map === undefined) {
    return
  }

  const spawn = playerSpawnOf(map)
  const target = worldPositionToGame(arxVector3toVector3(spawn.position), map.scenePosition)

  cameraStore.moveCamera(jumpPoseOf(pose, target, ENTITY_JUMP_DISTANCE))
}

/**
 * Picks the player of the level, or lets it go.
 */
function togglePlayerSelection(): void {
  revealGate.suppress()

  const selected = !isPlayerSelected.value

  isPlayerSelected.value = selected

  // the row of the spawn and the rows of the entities are the picks of the same list: one at a time
  if (selected) {
    entitySelectionStore.clear()
  }
}

/**
 * Whether the section of the player is open.
 *
 * @remarks
 * It starts **closed**, the way the folders do (2026-11-25, the owner): the list is opened for the entities of a level,
 * and the spawn is a row of its own that the author opens when the player is what they edit.
 */
const isPlayerOpen = shallowRef(false)

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

/**
 * The box of the accordions: the player and the folders scroll together, so the player stays reachable under the rows of
 * a folder (2026-11-25, the owner: the second box of the list hid it).
 */
const scroller = useTemplateRef<HTMLDivElement>('scroller')

/**
 * The line of the spawn in the list.
 */
const playerRow = useTemplateRef<HTMLLIElement>('playerRow')

/**
 * How many frames a reveal follows the box for.
 *
 * @remarks
 * The dock gives a widget its size after the widget is attached: the first scroll reads the box of the moment, and the
 * passes after it read the box the author has. The layout pass of the dock is a frame or two long.
 */
const REVEAL_PASSES = 3

/**
 * The frame that waits for a box the dock has not laid out yet.
 *
 * @returns A promise that resolves on the next frame.
 */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve()
    })
  })
}

/**
 * Reads the line of an entity the category box drew.
 *
 * @param index The index of the entity in the DLF list.
 *
 * @returns The line of the entity, or `null` while the box is not on the screen.
 */
function entityRowElementOf(index: number): HTMLElement | null {
  const element = scroller.value

  if (element === null) {
    return null
  }

  for (const row of element.querySelectorAll<HTMLElement>(':scope [data-entity-index]')) {
    if (row.dataset.entityIndex === String(index)) {
      return row
    }
  }

  return null
}

/**
 * The reveal of the entity that is being worked out, so a selection that moves on takes the last one away.
 */
let entityRevealToken = 0

/**
 * The reveal of the player that is being worked out, so a pick that moves on takes the last one away.
 */
let playerRevealToken = 0

/**
 * The height of the sticky head of an accordion, in css pixels.
 *
 * @param element The box of the accordions.
 *
 * @returns The room the head of a folder takes at the top of the box.
 */
function stickyInsetOf(element: HTMLElement | null): number {
  const head = element?.querySelector<HTMLElement>(':scope .AccordionRow > .head')

  return head?.getBoundingClientRect().height ?? 0
}

/**
 * Scrolls the box of the accordions to the picked entity, reading the geometry of the moment.
 */
function revealPickedEntity(): void {
  const selected = entitySelectionStore.entity.value

  if (selected === undefined) {
    return
  }

  revealRowIn(scroller.value, entityRowElementOf(selected), stickyInsetOf(scroller.value))
}

/**
 * Scrolls the box of the accordions to the row of the player, if the player is picked.
 */
function revealPickedPlayer(): void {
  if (!isPlayerSelected.value) {
    return
  }

  revealRowIn(scroller.value, playerRow.value, stickyInsetOf(scroller.value))
}

/**
 * Puts the picked entity on the screen: opens its folder, and scrolls the row into the box.
 *
 * @remarks
 * The owner asked for a selection to find its list (2026-11-24): an entity picked in the walkable view is on the screen of
 * the list, in the folder it belongs to. A search that hides the entity is cleared, because the author picked an entity
 * to see it; the folders the list folds away are opened on the way. The dock lays a widget out after it is attached, so
 * the scroll runs again a couple of frames later: the box the author sees has its own height by then, and the row was on
 * the screen of the box of the moment only.
 */
async function revealSelectedEntity(): Promise<void> {
  const token = entityRevealToken + 1

  entityRevealToken = token

  const selected = entitySelectionStore.entity.value

  if (selected === undefined) {
    return
  }

  const row = rows.value.find((candidate) => {
    return candidate.index === selected
  })

  if (row === undefined) {
    return
  }

  const hidden = shown.value.every((candidate) => {
    return candidate.index !== selected
  })

  if (hidden) {
    query.value = ''
  }

  openSections.add(row.category)

  // the folder and the search are written on the state, the list is drawn from it on the next tick
  await nextTick()

  for (let pass = 0; pass < REVEAL_PASSES; pass++) {
    if (token !== entityRevealToken) {
      return
    }

    revealPickedEntity()

    await nextFrame()
  }
}

/**
 * Puts the row of the player on the screen, if the player is picked.
 */
async function revealSelectedPlayer(): Promise<void> {
  const token = playerRevealToken + 1

  playerRevealToken = token

  if (!isPlayerSelected.value) {
    return
  }

  isPlayerOpen.value = true

  await nextTick()

  for (let pass = 0; pass < REVEAL_PASSES; pass++) {
    if (token !== playerRevealToken) {
      return
    }

    revealPickedPlayer()

    await nextFrame()
  }
}

// a pick of the walkable view, a row of the selection inspector and a click in this list all write the same store
watch(
  () => {
    return entitySelectionStore.entity.value
  },
  () => {
    if (revealGate.take()) {
      return
    }

    revealSelectedEntity().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  },
)

watch(isPlayerSelected, (selected) => {
  if (!selected || revealGate.take()) {
    return
  }

  revealSelectedPlayer().catch(() => {
    // the reveal is a scroll of a widget: a box that went away takes it with it
  })
})

onMounted(() => {
  // a widget that arrives with an entity picked (a preset switch, a drag into the dock) shows it: the dock builds the
  // widget before it lays it out, so the reveal waits a frame for the box
  requestAnimationFrame(() => {
    revealSelectedEntity().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
    revealSelectedPlayer().catch(() => {
      // the reveal is a scroll of a widget: a box that went away takes it with it
    })
  })
})
</script>

<template>
  <div class="EntityListWidget">
    <WidgetHeading :label="props.label">
      <template #actions>
        <span class="total">Total: {{ rows.length }}</span>
      </template>
    </WidgetHeading>
    <SearchField v-if="rows.length > 0" v-model="query" placeholder="Search entities" label="Search entities" />
    <div ref="scroller" class="sections">
      <AccordionRow label="Player" value="spawn" :open="isPlayerOpen" @toggle="isPlayerOpen = !isPlayerOpen">
        <ul class="rows">
          <li
            ref="playerRow"
            class="row player-row"
            :class="{ 'is-selected': isPlayerSelected }"
            :data-selected="isPlayerSelected"
            @click="togglePlayerSelection"
          >
            <span class="name">spawn</span>
            <button
              class="jump"
              type="button"
              aria-label="Jump to the player"
              v-tooltip="'Jump to the player'"
              @click.stop="jumpToPlayer"
            >
              <ScanSearch :size="13" />
            </button>
          </li>
        </ul>
      </AccordionRow>
      <template v-if="shown.length > 0">
        <AccordionRow
          v-for="section in sections"
          :key="section.category"
          :label="section.label"
          :value="String(section.rows.length)"
          :empty="section.rows.length === 0"
          :open="isSectionOpen(section.category)"
          @toggle="toggleSection(section.category)"
        >
          <ul class="rows">
            <li
              v-for="row in section.rows"
              :key="row.index"
              class="row"
              :class="{ 'is-selected': entitySelectionStore.entity.value === row.index }"
              :data-selected="entitySelectionStore.entity.value === row.index"
              :data-entity-index="row.index"
              @click="selectRow(row)"
            >
              <span class="name">{{ row.entityName }}</span>
              <button
                class="jump"
                type="button"
                :aria-label="`Jump to entity ${row.entityName}`"
                v-tooltip="`Jump to entity ${row.entityName}`"
                @click.stop="jumpTo(row)"
              >
                <ScanSearch :size="13" />
              </button>
            </li>
          </ul>
        </AccordionRow>
      </template>
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
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    margin-top: 20px;
    // the rows stop before the scrollbar, the way the rows of the group inspector do: the bar takes the right edge
    padding: 0 10px 0 0;
    overflow-y: auto;
  }

  // the head of an accordion stays at the top of the box while the rows of its folder scroll under it; the widget's own
  // color is under the head, or the rows would show through it (2026-11-25, the owner: the head of a folder is the name
  // the author reads the rows by)
  // the color is `background-color` and not the `background` shorthand: the shorthand would reset the image the shared
  // row draws the hover with, and the head of a folder would not answer the pointer (2026-11-25, the owner)
  .sections :deep(.AccordionRow > .head) {
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: $surface-app;
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

    // a click picks the row: the entity (or the player of the level) takes the soft accent of a selected row, the same
    // the group inspector uses (2026-11-24, the owner: no button, just a row that says its name and jumps with its eye)
    cursor: pointer;

    &.is-selected {
      background-color: rgba($accent, 0.15);
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
