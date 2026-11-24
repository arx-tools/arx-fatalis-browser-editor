import { computed } from 'vue'
import { WIDGET_KINDS } from '../../../modules/layout/widgetKinds.ts'
import { widgetPresence } from '../../../modules/layout/widgetPresence.ts'
import { levelStore } from '../../../modules/level/edit/levelStore.ts'
import { roomNameOf } from '../../../modules/rooms/roomNames.ts'
import { currentRoom } from '../../../modules/rooms/roomUnderCrosshair.ts'
import { cameraStore } from '../camera/cameraStore.ts'
import { isRoomColorsVisible } from '../shared/levelDisplay.ts'
import { snapEnabled, snapModifierHeld } from '../shared/snapping.ts'

/**
 * Whether the snap of the translate gizmo is on now: the magnet, or Shift for the length of the drag.
 *
 * @remarks
 * The icon follows both: a Shift press lights it up **on the key event**, before the pointer moves, so the author sees
 * the key is held when the magnet itself is off.
 */
export const snapActive = computed(() => {
  return snapEnabled.value || snapModifierHeld.value
})

/**
 * Flips the magnet of the translate gizmo.
 *
 * @remarks
 * The switch is a preference of the editor: it stays in the browser, and Shift turns the snap on for a drag without
 * moving it, so a single drag can snap and the next one can go free.
 */
export function toggleMagnet(): void {
  snapEnabled.value = !snapEnabled.value
}

/**
 * What the widget shows over the canvas: a failure, or nothing while the level is on.
 *
 * The level itself is loaded by {@link levelStore}, so a rebuilt widget shows it at once. The wait of a load is not
 * shown here: the app puts a cover over the editor for it, with the words in white (`LoadingOverlay`).
 */
export const status = computed(() => {
  if (levelStore.status.value === 'error') {
    return levelStore.error.value ?? 'Failed to load the level.'
  }

  // the wait of a load is the cover of the app (`LoadingOverlay`), with the words over it: the widget stays clean
  return ''
})

/**
 * Whether a level is on the screen: a notice about a level that could not open waits over an empty view, and the
 * numbers of a camera belong to a level.
 */
export const hasLevel = computed(() => {
  return levelStore.map.value !== undefined
})

/**
 * The readout over the canvas: the camera position and rotation in the game's coordinates, in the same
 * format as the game's own debug hud. There is no pencil button and no click-to-copy yet.
 *
 * @remarks
 * The numbers come from {@link cameraStore}, the same place the camera controls widget reads and writes them, so
 * the readout follows a typed position as well as a walked one. While the camera controls widget is on the
 * dock the readout is hidden: it would show the same numbers twice.
 */
export const hud = computed(() => {
  const pose = cameraStore.pose.value

  // a camera that has no level under it shows a pose of the url: the numbers of a level that is not on the screen
  if (pose === undefined || !hasLevel.value) {
    return ''
  }

  // the camera form shows the same numbers: while it is on the dock the readout is a duplicate
  if (widgetPresence.kinds.value.has(WIDGET_KINDS.cameraControls)) {
    return ''
  }

  return [
    `position  ${pose.position.x.toFixed(2)}  ${pose.position.y.toFixed(2)}  ${pose.position.z.toFixed(2)}`,
    `rotation  ${pose.angle.pitch.toFixed(2)}  ${pose.angle.yaw.toFixed(2)}  0.00`,
  ].join('\n')
})

/**
 * The room of the face under the crosshair, as the readout at the bottom of the view writes it.
 *
 * @remarks
 * It is the room the room map highlights, so the words and the color say the same thing: the name follows the number
 * when the author gave one (the pair the room list shows). The line is empty while the room map is off, and while the
 * crosshair points at no face or at a face without a room, so the view says nothing there.
 */
export const roomReadout = computed(() => {
  if (!isRoomColorsVisible.value) {
    return ''
  }

  const room = currentRoom.value

  if (room === undefined) {
    return ''
  }

  const name = roomNameOf(room)

  if (name === undefined) {
    return `room ${String(room)}`
  }

  return `room ${String(room)} · ${name}`
})
