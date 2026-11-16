import type { ArxPolygon } from 'arx-convert/types'
import { computed, type ComputedRef } from 'vue'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionModeOf, selectionStore, type SelectionModifiers } from '../selection/selectionStore.ts'
import { activeFaceGroups, faceIndicesOfGroup, presentPolygons } from './groupStore.ts'

/**
 * The groups of the open level that hold a selected face.
 *
 * @remarks
 * The pick of the list is not a state of its own: it is the selection read back, the way the room inspector does it. A
 * face can be in more than one group, so a selection can light more than one row; a group whose every face is gone lights
 * only when its faces are selected, which is never.
 */
export const selectedFaceGroups: ComputedRef<ReadonlySet<number>> = computed(() => {
  const map = levelStore.map.value
  const selection = selectionStore.polygons.value
  const present = presentPolygons.value
  const ids = new Set<number>()

  if (map === undefined || selection.size === 0) {
    return ids
  }

  const selected = new Set<ArxPolygon>()

  for (const index of selection) {
    const polygon = map.polygons[index]

    if (polygon !== undefined && present.has(polygon)) {
      selected.add(polygon)
    }
  }

  for (const group of activeFaceGroups.value) {
    for (const member of group.members) {
      if (selected.has(member)) {
        ids.add(group.id)

        break
      }
    }
  }

  return ids
})

/**
 * Tells whether the pick of the list is exactly this group.
 *
 * @param groupId The group whose pick is asked.
 *
 * @returns True when the group is the only one the selection lights.
 */
export function isFaceGroupPicked(groupId: number): boolean {
  return selectedFaceGroups.value.size === 1 && selectedFaceGroups.value.has(groupId)
}

/**
 * Picks a group: selects its faces, or clears both when the picked group is clicked again.
 *
 * @remarks
 * The three modes are the ones of the walkable view and the room inspector: a plain click replaces the selection, `Shift`
 * adds the faces of the group, `Ctrl`/`Meta` takes them away. The pick is the selection, so the rows that light are the
 * groups the selection holds a face of.
 *
 * @param groupId The group to pick.
 * @param event The click, whose modifiers decide what the group does with the selection.
 */
export function pickFaceGroup(groupId: number, event: SelectionModifiers): void {
  const mode = selectionModeOf(event)

  if (mode === 'replace' && isFaceGroupPicked(groupId)) {
    selectionStore.clear()

    return
  }

  selectionStore.selectMany(faceIndicesOfGroup(groupId), mode)
}
