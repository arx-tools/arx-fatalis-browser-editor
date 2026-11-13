import { computed, shallowRef, type ComputedRef, type ShallowRef } from 'vue'

/**
 * The rooms the room inspector picked, and the room map highlights.
 *
 * @remarks
 * A module level singleton, for the same reason as the level and the selection: a dock widget is its own Vue app, so
 * the panel and the 3D view can not pass values down a component tree. The values are the **ids of the rooms**, not
 * their places in the list, so an edit that changes the list does not point at another room.
 *
 * The set is the one the **selection** writes (`roomSelection.ts`): picking a room selects its faces, and selecting
 * faces highlights the rooms they are in. More than one room can be lit at once (a selection that spans two of them).
 */
export const selectedRooms: ShallowRef<ReadonlySet<number>> = shallowRef(new Set())

/**
 * The room the inspector picked, when the pick is exactly one room.
 *
 * @remarks
 * The panel and the plan of a `Merge into...` name one room; the map and the list read the set. The value is
 * `undefined` when nothing is picked, or when the pick is more than one room.
 */
export const selectedRoom: ComputedRef<number | undefined> = computed(() => {
  if (selectedRooms.value.size !== 1) {
    return undefined
  }

  const [only] = selectedRooms.value

  return only
})

/**
 * Picks the rooms to highlight, or clears the pick.
 *
 * @param rooms The rooms to highlight; an empty set highlights none.
 */
export function selectRooms(rooms: ReadonlySet<number>): void {
  selectedRooms.value = rooms
}

/**
 * Picks one room to highlight, or clears the pick.
 *
 * @param room The room to highlight, or `undefined` to highlight none.
 */
export function selectRoom(room: number | undefined): void {
  if (room === undefined) {
    selectRooms(new Set())

    return
  }

  selectRooms(new Set([room]))
}
