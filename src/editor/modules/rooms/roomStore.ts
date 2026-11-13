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
 * The rooms the checkboxes of the list lit, beside the ones the selection does.
 *
 * @remarks
 * A checkbox is a **highlight** and nothing else (`166/2`): the author can look at several rooms at once without making
 * them the selection, which is what the row click does (and what the moves of the mapper take).
 */
export const checkedRooms: ShallowRef<ReadonlySet<number>> = shallowRef(new Set())

/**
 * The room the pointer of the author is on, which the map lights while it is there.
 *
 * @remarks
 * It is a preview of a row, so it is gone as soon as the pointer leaves: the set of the lit rooms is the selection, the
 * checkboxes and this one together ({@link litRooms}).
 */
export const hoveredRoom: ShallowRef<number | undefined> = shallowRef(undefined)

/**
 * The rooms the room map lights: the ones of the selection, the checkboxes, and the hovered one.
 */
export const litRooms: ComputedRef<ReadonlySet<number>> = computed(() => {
  const lit = new Set(selectedRooms.value)

  for (const room of checkedRooms.value) {
    lit.add(room)
  }

  const hovered = hoveredRoom.value

  if (hovered !== undefined) {
    lit.add(hovered)
  }

  return lit
})

/**
 * Adds a room to the checked ones, or takes it out.
 *
 * @param room The room of the checkbox.
 */
export function toggleCheckedRoom(room: number): void {
  const next = new Set(checkedRooms.value)

  if (next.has(room)) {
    next.delete(room)
  } else {
    next.add(room)
  }

  checkedRooms.value = next
}

/**
 * Lights the room the pointer is on, or clears the hover.
 *
 * @param room The room under the pointer, or `undefined` when the pointer left the list.
 */
export function hoverRoom(room: number | undefined): void {
  hoveredRoom.value = room
}

/**
 * Clears the checkboxes and the hover: another level has other ids, so neither survives it.
 */
export function clearRoomHighlight(): void {
  checkedRooms.value = new Set()
  hoveredRoom.value = undefined
}

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
