import { shallowRef, watch, type ShallowRef } from 'vue'
import type { ArxMap } from '../../../generator/ArxMap.ts'
import { crosshairStore } from '../crosshair/crosshairStore.ts'
import { levelStore } from '../level/edit/levelStore.ts'

/**
 * Reads the room of the face under the crosshair.
 *
 * @param map The level, when it is loaded.
 * @param polygon The face under the crosshair, or `undefined` when the ray hits nothing.
 *
 * @returns The room of that face, or `undefined` when there is no face (or it has no room).
 */
export function roomUnderCrosshairOf(map: ArxMap | undefined, polygon: number | undefined): number | undefined {
  if (map === undefined || polygon === undefined) {
    return undefined
  }

  const face = map.polygons[polygon]

  if (face === undefined || face.room < 0) {
    return undefined
  }

  return face.room
}

/**
 * The room of the face under the crosshair of the walkable view.
 *
 * @remarks
 * The crosshair store holds the face the walkable view picked on its last frame, and the level gives it its room. The
 * room inspector, the readout of the view and the room map all read this one value, so they can not name different
 * rooms. A face without a room (the `-1` of the level) and a ray that hit nothing both read as `undefined`.
 *
 * The value changes only when the **room** does: the walkable view picks a face on every frame it draws, and a pick
 * that lands in the same room must not repaint the room map or wake the widgets that read it. The watcher compares the
 * room of the pick, so a walk within one room is one value.
 */
export const currentRoom: ShallowRef<number | undefined> = shallowRef(undefined)

/**
 * Whether {@link startCurrentRoom} already put the watcher in place.
 */
let started = false

/**
 * Starts the watcher that keeps {@link currentRoom} on the room of the pick.
 *
 * @remarks
 * The app starts it with the other modules of the room (`App.vue`), before the level arrives: the watcher has to be
 * there when the first frame picks a face. A second start is harmless, so the editor can call it from more than one
 * place.
 */
export function startCurrentRoom(): void {
  if (started) {
    return
  }

  started = true

  watch(
    () => {
      return roomUnderCrosshairOf(levelStore.map.value, crosshairStore.polygon.value)
    },
    (room) => {
      currentRoom.value = room
    },
    { immediate: true, flush: 'sync' },
  )
}
