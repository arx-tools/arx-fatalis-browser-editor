import { shallowRef, type ShallowRef } from 'vue'
import { isPlayerSelected } from '../level/entities/playerSpawn.ts'

/**
 * The entity the editor has selected.
 *
 * @remarks
 * The selection is the **index of the DLF's interactive object** (the order of `map.dlf.interactiveObjects`), the way the
 * light selection keeps the indices of `map.lights`: an entity has an identifier of its own, but two entities of a level
 * can share it, so the place in the list is what tells them apart. The entity list and the markers of the walkable view
 * share this store, and a pick of a marker writes into it.
 */
export type EntitySelectionStore = {
  /**
   * The selected entity, or `undefined` when nothing is selected.
   */
  readonly entity: ShallowRef<number | undefined>
  /**
   * The entity under the crosshair of the view, which the markers draw brighter.
   */
  readonly hover: ShallowRef<number | undefined>
  /**
   * Takes the selection to an entity, or drops it.
   *
   * @param entity The index of the entity in `map.dlf.interactiveObjects`, or `undefined` to drop the selection.
   */
  readonly select: (entity: number | undefined) => void
  /**
   * Puts an entity under the crosshair, or takes the hover away.
   *
   * @param entity The index of the entity in `map.dlf.interactiveObjects`, or `undefined` for no hover.
   */
  readonly setHover: (entity: number | undefined) => void
  /**
   * Drops the selection.
   */
  readonly clear: () => void
}

/**
 * The single store of the entity selection: the list, the markers and the pick all read this one.
 */
export const entitySelectionStore: EntitySelectionStore = {
  entity: shallowRef<number | undefined>(undefined),
  hover: shallowRef<number | undefined>(undefined),
  select: (entity: number | undefined): void => {
    entitySelectionStore.entity.value = entity

    // the player of the level is a pick of the list too (the row of the spawn), so the two cannot stand together: a pick
    // of an entity takes the spawn away, the way a click on the entity list replaces what the crosshair had
    // (2026-11-25, the owner)
    if (entity !== undefined) {
      isPlayerSelected.value = false
    }
  },
  setHover: (entity: number | undefined): void => {
    entitySelectionStore.hover.value = entity
  },
  clear: (): void => {
    entitySelectionStore.entity.value = undefined
  },
}
