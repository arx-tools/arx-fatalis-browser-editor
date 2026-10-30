import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import { onKeyboardAction } from '../keyboard/keyboard.ts'

/**
 * What a gesture does with the polygons it touches.
 *
 * @remarks
 * A plain click starts a new selection, `Shift` adds to it and `Ctrl` (or `Meta`) takes away from it, the
 * same reading the archived editor had. The drag of the walkable view and the double click of the texture
 * fill follow the same three modes.
 */
export type SelectionMode = 'add' | 'remove' | 'replace'

/**
 * The modifiers of a mouse event, as far as the selection cares about them.
 */
export interface SelectionModifiers {
  /**
   * Whether `Shift` is held down: the click adds to the selection.
   */
  readonly shiftKey: boolean
  /**
   * Whether `Ctrl` is held down: the click takes away from the selection.
   */
  readonly ctrlKey: boolean
  /**
   * Whether `Meta` is held down: on the apple keyboards this is the `Ctrl` of the others.
   */
  readonly metaKey: boolean
}

/**
 * Reads the mode of a click from its modifiers.
 *
 * @param event The mouse event of the click.
 *
 * @returns The mode the click asks for.
 */
export function selectionModeOf(event: SelectionModifiers): SelectionMode {
  if (event.ctrlKey || event.metaKey) {
    return 'remove'
  }

  if (event.shiftKey) {
    return 'add'
  }

  return 'replace'
}

/**
 * The polygons the editor has selected.
 *
 * @remarks
 * The selection is stored as **polygon indices** of the level (the order of `ArxMap.polygons`), not as
 * triangles: a quad is one polygon with two triangles, so it counts once here, and a later gesture can mix
 * quads and triangles without the caller knowing which is which.
 */
export interface SelectionStore {
  /**
   * The selected polygons, as a read only set.
   */
  readonly polygons: ShallowRef<ReadonlySet<number>>
  /**
   * How many polygons are selected: a quad counts as one.
   */
  readonly count: ComputedRef<number>
  /**
   * Drops the selection and keeps the given polygon.
   *
   * @param polygon The polygon the click landed on.
   */
  readonly selectOnly: (polygon: number) => void
  /**
   * Puts a polygon into the selection, if it is not there yet.
   *
   * @param polygon The polygon to add.
   */
  readonly add: (polygon: number) => void
  /**
   * Takes a polygon out of the selection, if it is there.
   *
   * @param polygon The polygon to remove.
   */
  readonly remove: (polygon: number) => void
  /**
   * Puts a group of polygons into the selection, or takes them out of it.
   *
   * @param polygons The polygons of the gesture.
   * @param mode Whether the group replaces the selection, adds to it or is removed from it.
   */
  readonly selectMany: (polygons: readonly number[], mode: SelectionMode) => void
  /**
   * Empties the selection.
   */
  readonly clear: () => void
}

/**
 * Builds a selection store.
 *
 * @returns The store, with an empty selection.
 */
export function createSelectionStore(): SelectionStore {
  const polygons = shallowRef<ReadonlySet<number>>(new Set())

  return {
    polygons,
    count: computed(() => {
      return polygons.value.size
    }),
    selectOnly: (polygon: number): void => {
      polygons.value = new Set([polygon])
    },
    add: (polygon: number): void => {
      const next = new Set(polygons.value)
      next.add(polygon)
      polygons.value = next
    },
    remove: (polygon: number): void => {
      const next = new Set(polygons.value)
      next.delete(polygon)
      polygons.value = next
    },
    selectMany: (group: readonly number[], mode: SelectionMode): void => {
      if (mode === 'replace') {
        polygons.value = new Set(group)

        return
      }

      const next = new Set(polygons.value)

      for (const polygon of group) {
        if (mode === 'remove') {
          next.delete(polygon)
        } else {
          next.add(polygon)
        }
      }

      polygons.value = next
    },
    clear: (): void => {
      polygons.value = new Set()
    },
  }
}

/**
 * The selection of the editor: one store, shared by the views and the statistics widget.
 */
export const selectionStore = createSelectionStore()

/**
 * Binds the selection keys of the editor.
 *
 * @remarks
 * Only the clearing has a key of its own (`C`): the adding and the removing live on the modifiers of a
 * click in the walkable view, because they act on what the crosshair points at.
 */
export function startSelection(): void {
  onKeyboardAction('clearSelection', () => {
    selectionStore.clear()
  })
}
