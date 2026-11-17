import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import type { SelectionMode } from './selectionStore.ts'

/**
 * The lights the editor has selected.
 *
 * @remarks
 * The selection is stored as **indices of `map.lights`** (the order of the LLF), the way the face selection keeps the
 * polygon indices: a light has no identifier of its own, so its place in the list is its name. The light editor and the
 * Light Inspector share this store, and the walkable view picks a marker into it.
 */
export type LightSelectionStore = {
  /**
   * The selected lights, as a read only set.
   */
  readonly lights: ShallowRef<ReadonlySet<number>>
  /**
   * How many lights are selected.
   */
  readonly count: ComputedRef<number>
  /**
   * Drops the selection and keeps the given light.
   *
   * @param light The index of the light in `map.lights`.
   */
  readonly selectOnly: (light: number) => void
  /**
   * Puts a light into the selection, if it is not there yet.
   *
   * @param light The index of the light in `map.lights`.
   */
  readonly add: (light: number) => void
  /**
   * Takes a light out of the selection, if it is there.
   *
   * @param light The index of the light in `map.lights`.
   */
  readonly remove: (light: number) => void
  /**
   * Puts a group of lights into the selection, or takes them out of it.
   *
   * @param lights The indices of the lights of the gesture.
   * @param mode Whether the group replaces the selection, adds to it or is removed from it.
   */
  readonly selectMany: (lights: readonly number[], mode: SelectionMode) => void
  /**
   * Empties the selection.
   */
  readonly clear: () => void
}

/**
 * Builds a light selection store.
 *
 * @returns The store, with an empty selection.
 */
export function createLightSelectionStore(): LightSelectionStore {
  const lights = shallowRef<ReadonlySet<number>>(new Set())

  return {
    lights,
    count: computed(() => {
      return lights.value.size
    }),
    selectOnly: (light: number): void => {
      lights.value = new Set([light])
    },
    add: (light: number): void => {
      const next = new Set(lights.value)
      next.add(light)
      lights.value = next
    },
    remove: (light: number): void => {
      const next = new Set(lights.value)
      next.delete(light)
      lights.value = next
    },
    selectMany: (group: readonly number[], mode: SelectionMode): void => {
      if (mode === 'replace') {
        lights.value = new Set(group)

        return
      }

      const next = new Set(lights.value)

      for (const light of group) {
        if (mode === 'remove') {
          next.delete(light)
        } else {
          next.add(light)
        }
      }

      lights.value = next
    },
    clear: (): void => {
      lights.value = new Set()
    },
  }
}

/**
 * The selected lights of the editor: one store, shared by the view and the Light Inspector.
 */
export const lightSelectionStore = createLightSelectionStore()
