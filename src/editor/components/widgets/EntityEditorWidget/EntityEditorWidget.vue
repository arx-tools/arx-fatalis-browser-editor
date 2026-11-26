<script setup lang="ts">
import { ArrowDownToLine } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import Button from '../../Button.vue'
import Notice from '../../Notice.vue'
import WidgetHeading from '../../WidgetHeading.vue'
import { commandOf } from '../../../modules/history/commands.ts'
import { createSetEntityPositionRecord } from '../../../modules/history/records/entities.ts'
import { createSetSpawnRecord } from '../../../modules/history/records/spawn.ts'
import { floorBelow } from '../../../modules/level/entities/entityFloor.ts'
import { entityNameOf } from '../../../modules/level/entities/entityRows.ts'
import { isPlayerSelected, playerSpawnOf } from '../../../modules/level/entities/playerSpawn.ts'
import { runStep } from '../../../modules/level/edit/editing.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { entitySelectionStore } from '../../../modules/selection/entitySelectionStore.ts'

/**
 * The editor of the picked entity, and of the spawn of the player.
 *
 * @remarks
 * The first slice of the entity work (TODO 320) and the first write of an entity: the **drop to floor** of TODO 199, on
 * one picked entity (the multiselect is TODO 240) and on the spawn of the player, which is the same gesture on the
 * other roll of the list. The widget goes in the Controls category and sits over the entity inspector in the Entities
 * preset (350 wide, 200 high, locked by the preset).
 *
 * The place of an entity is the one of the DLF (`map.dlf.interactiveObjects[index].position`), in the local space of the
 * level, and the drop finds the highest face under it with {@link floorBelow} and writes the y of the place. The write is
 * a step of the history, so the undo puts the entity back where it was.
 */
const props = defineProps<{
  /**
   * The label of the widget, from the widget definition.
   */
  readonly label: string
}>()

/**
 * The entity the level has selected, or the one of the player.
 *
 * @remarks
 * The two picks of the list exclude each other (the store and the row of the player keep it so), so the widget reads one
 * of them: the spawn when the player is picked, the entity otherwise.
 */
const picked = computed(() => {
  const map = levelStore.map.value

  if (map === undefined) {
    return undefined
  }

  if (isPlayerSelected.value) {
    return { kind: 'player' as const }
  }

  const index = entitySelectionStore.entity.value

  if (index === undefined) {
    return undefined
  }

  const entity = map.entities[index]

  if (entity === undefined) {
    return undefined
  }

  return { kind: 'entity' as const, index, entity }
})

/**
 * The line of the widget about what it edits: the name of the entity and its identifier, the spawn, or the invitation to
 * pick one.
 */
const pickedText = computed<string>(() => {
  const pick = picked.value

  if (pick === undefined) {
    return 'Select an entity or the player spawn'
  }

  if (pick.kind === 'player') {
    return 'Player spawn'
  }

  return `${entityNameOf(pick.entity)} (#${String(pick.entity.identifier)})`
})

/**
 * Whether there is something to drop, and the level to drop it on.
 */
const canDrop = computed<boolean>(() => {
  return levelStore.map.value !== undefined && picked.value !== undefined
})

/**
 * What the last drop said, when it found nothing under the pick.
 *
 * @remarks
 * A drop that found a floor says nothing (2026-11-26, the owner): the entity moves in the view, which is the feedback. A
 * drop that found no floor says so, because the entity stays where it is and the author would not know why.
 */
const message = ref<string>('')

// the message belongs to the pick it was made for: another entity, or the spawn, starts without one
watch([picked, levelStore.map], () => {
  message.value = ''
})

/**
 * Puts the picked entity, or the spawn of the player, on the highest floor under it.
 *
 * @remarks
 * The ray goes down from the x/z of the pick (see {@link floorBelow}); the place of an entity is its feet, and the spawn
 * of the player is read as its feet too (`playerSpawnOf`), so the y of the hit is the y the pick takes. The step keeps
 * the place before and after it, so the undo moves the entity back.
 */
function dropToFloor(): void {
  const map = levelStore.map.value
  const pick = picked.value

  if (map === undefined || pick === undefined) {
    return
  }

  // the solid mesh is the level's own: the faces of the polygons, in the space the picks are in
  const mesh = map.solidMeshes[0]

  if (mesh === undefined) {
    return
  }

  if (pick.kind === 'player') {
    const spawn = playerSpawnOf(map)
    const floor = floorBelow(mesh, spawn.position)

    if (floor === undefined) {
      message.value = 'No floor below the player spawn'

      return
    }

    const command = commandOf(
      createSetSpawnRecord(spawn, { position: { ...spawn.position, y: floor }, yaw: spawn.yaw }),
      map,
    )

    if (command === undefined) {
      return
    }

    message.value = ''
    runStep(command)

    return
  }

  const floor = floorBelow(mesh, pick.entity.position)

  if (floor === undefined) {
    message.value = `No floor below ${entityNameOf(pick.entity)}`

    return
  }

  const command = commandOf(
    createSetEntityPositionRecord([
      {
        index: pick.index,
        before: { ...pick.entity.position },
        after: { ...pick.entity.position, y: floor },
      },
    ]),
    map,
  )

  if (command === undefined) {
    return
  }

  message.value = ''
  runStep(command)
}
</script>

<template>
  <div class="EntityEditorWidget">
    <WidgetHeading :label="props.label" />

    <div class="picked" :data-picked="picked === undefined ? 'none' : picked.kind">
      <span class="caption">Selection</span>
      <span class="value" :class="{ 'is-empty': picked === undefined }">{{ pickedText }}</span>
    </div>

    <Button
      class="drop"
      label="Drop to floor"
      :disabled="!canDrop"
      data-action="drop-to-floor"
      v-tooltip="'Move the picked entity or the player spawn to the highest floor under it'"
      @click="dropToFloor"
    >
      <ArrowDownToLine :size="14" aria-hidden="true" />
    </Button>

    <Notice v-if="message !== ''" class="message">{{ message }}</Notice>
  </div>
</template>

<style scoped lang="scss">
@use '../../../palette' as *;

.EntityEditorWidget {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  // the same inset as the other widgets of the work: the heading's rule and the content start at the same place
  padding: 0 8px 8px;
  overflow: auto;

  .picked {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .caption {
    flex: none;
    color: $text-muted;
    font-size: 12px;
  }

  .value {
    overflow: hidden;
    color: $text;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value.is-empty {
    color: $text-subtle;
  }

  .drop {
    flex: none;
  }

  .message {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
  }
}
</style>
