import { shallowRef, type ShallowRef } from 'vue'

/**
 * The light the crosshair of the walkable view is on.
 *
 * @remarks
 * The views are the only ones that can read the ray, and a widget is not a view: this store is the one value between
 * them. The walkable view writes the light it picks on every frame it draws, the ring of the overlay reads it (a white
 * ring, like the one of the pick), and the pick of a marker wins over the face behind it.
 *
 * The value is an index of `map.lights`, exactly like the selection, so an edit that moves the lights around leaves it
 * stale: the next frame of the view writes a fresh one, and a widget reads it as a hint.
 */
export type LightHoverStore = {
  /**
   * The light under the crosshair, or `undefined` when the ray hits no marker.
   */
  readonly light: ShallowRef<number | undefined>
  /**
   * Reports the light the crosshair is on.
   *
   * @param light The light, or `undefined` for none.
   */
  readonly set: (light: number | undefined) => void
}

/**
 * Builds the store of the light hover.
 *
 * @returns The store, with no light under the crosshair.
 */
export function createLightHoverStore(): LightHoverStore {
  const light = shallowRef<number | undefined>(undefined)

  return {
    light,
    set: (next: number | undefined): void => {
      // a shallow ref compares its value: a frame that finds the same light writes the same number, and nothing
      // watching the store wakes up (the walkable view picks on every frame it draws)
      light.value = next
    },
  }
}

/**
 * The light under the crosshair of the walkable view.
 */
export const lightHoverStore = createLightHoverStore()
