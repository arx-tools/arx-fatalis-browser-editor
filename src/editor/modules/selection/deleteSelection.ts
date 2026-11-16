import { selectedFaceGroups } from '../groups/groupSelection.ts'
import { deleteFaceGroups } from '../groups/groupStore.ts'
import { onKeyboardAction } from '../keyboard/keyboard.ts'
import { currentMapId } from '../level/source/maps.ts'
import { WIDGET_KINDS } from '../layout/widgetKinds.ts'
import { deleteSelectedPolygons } from '../level/edit/editing.ts'
import { deleteRooms } from '../rooms/roomDeletion.ts'
import { selectedRooms } from '../rooms/roomStore.ts'

/**
 * Tells whether the keyboard belongs to a widget of the given kind.
 *
 * @remarks
 * The `Delete` of the editor is one key with three meanings, and the focus is what tells them apart: a click in the list
 * of the room or the group inspector takes the focus there (the list is focusable), so the rows are the target; a click in
 * the walkable view leaves the focus on the canvas, and the key deletes the selected faces.
 *
 * @param kind The kind of the widget, like `room-inspector`.
 *
 * @returns True when the focused element sits in a widget of that kind.
 */
function isFocusInWidget(kind: string): boolean {
  const active = document.activeElement

  if (!(active instanceof Element)) {
    return false
  }

  const widget = active.closest('.lm-DockPanel-widget')

  if (!(widget instanceof HTMLElement)) {
    return false
  }

  return widget.dataset.widgetKind === kind
}

/**
 * Deletes what the author is working on: the picked rooms or groups of an inspector with the focus, or the faces.
 *
 * @remarks
 * The two inspectors are read in the order of their specificity: a picked room is a room (its faces stay in the level),
 * a picked group is a group (its faces stay too), and everything else is the face selection. A row of no room or a group
 * without a picked face falls through to the faces: there is no room or group to take out there.
 */
export function deleteSelectionInContext(): void {
  if (isFocusInWidget(WIDGET_KINDS.roomInspector)) {
    const rooms = [...selectedRooms.value].filter((room) => {
      return room >= 0
    })

    if (rooms.length > 0 && deleteRooms(rooms)) {
      return
    }
  }

  if (isFocusInWidget(WIDGET_KINDS.groupInspector)) {
    const groups = [...selectedFaceGroups.value]

    if (groups.length > 0) {
      deleteFaceGroups(currentMapId.value, groups)

      return
    }
  }

  deleteSelectedPolygons()
}

/**
 * Binds the `Delete` of the editor to {@link deleteSelectionInContext}.
 */
export function startDeleteSelection(): void {
  onKeyboardAction('deleteSelectedPolygons', deleteSelectionInContext)
}
