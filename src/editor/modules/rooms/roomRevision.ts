import { shallowRef } from 'vue'

/**
 * How many times the rooms of the faces were written.
 *
 * @remarks
 * The room map paints the faces with the colour of their room, and the colour of a room comes from the room graph of
 * the level: a face that moves into a room the map has not coloured yet needs the colours again. The geometry is not
 * rebuilt by a move (the vertex count stays the same), so the views can not tell a room write from a texture paint by
 * the buffers: this counter is what tells them (2026-11-15, the owner: the corner moved into a new room stayed grey on
 * the room map).
 *
 * The step of the history writes the rooms twice (the forward and the undo), and both go through the same command, so
 * the counter is the one of the writes and not of the steps.
 */
export const roomRevision = shallowRef(0)

/**
 * Counts a write of the rooms of the faces, so the room maps of the views are painted again.
 */
export function bumpRoomRevision(): void {
  roomRevision.value = roomRevision.value + 1
}
