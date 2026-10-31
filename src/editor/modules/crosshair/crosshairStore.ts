import { shallowRef, type ShallowRef } from 'vue'

/**
 * The polygon the crosshair of the walkable view is on.
 *
 * @remarks
 * The views are the only ones that can read the ray, and a widget is not a view: this store is the one value
 * between them. The walkable view writes the polygon it picks on every frame it draws, and the widgets that
 * describe a face (the polygon inspector) read it.
 *
 * The value is a polygon index of {@link ../level/levelStore}, exactly like the selection, so an edit that
 * moves the indices around leaves it stale — it is read as a hint, and a widget has to drop an index the level
 * no longer has.
 */
export interface CrosshairStore {
  /**
   * The polygon under the crosshair, or `undefined` when the ray hits nothing.
   */
  readonly polygon: ShallowRef<number | undefined>
  /**
   * Reports the polygon the crosshair is on.
   *
   * @param polygon The polygon, or `undefined` for nothing.
   */
  readonly set: (polygon: number | undefined) => void
}

/**
 * Builds the store of the crosshair.
 *
 * @returns The store, with nothing under the crosshair.
 */
export function createCrosshairStore(): CrosshairStore {
  const polygon = shallowRef<number | undefined>(undefined)

  return {
    polygon,
    set: (next: number | undefined): void => {
      // a shallow ref compares its value: a frame that finds the same face writes the same number, and nothing
      // watching the store wakes up (the walkable view picks on every frame it draws)
      polygon.value = next
    },
  }
}

/**
 * The polygon under the crosshair of the walkable view.
 */
export const crosshairStore = createCrosshairStore()
