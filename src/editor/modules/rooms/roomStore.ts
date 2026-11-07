import { shallowRef, type ShallowRef } from 'vue'

/**
 * The room the areas panel picked, and the room map highlights.
 *
 * @remarks
 * A module level singleton, for the same reason as the level and the selection: a dock widget is its own Vue app, so
 * the panel and the 3D view can not pass values down a component tree. The value is the **id of the room**, not its
 * place in the list, so an edit that changes the list does not point at another room.
 */
export const selectedRoom: ShallowRef<number | undefined> = shallowRef(undefined)

/**
 * Picks a room, or clears the pick.
 *
 * @param room The room to highlight, or `undefined` to highlight none.
 */
export function selectRoom(room: number | undefined): void {
  selectedRoom.value = room
}
