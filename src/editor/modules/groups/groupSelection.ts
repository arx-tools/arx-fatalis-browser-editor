import type { ArxPolygon } from 'arx-convert/types'
import { computed, type ComputedRef } from 'vue'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionModeOf, selectionStore, type SelectionModifiers } from '../selection/selectionStore.ts'
import { faceIndicesOfGroup } from './groupQueries.ts'
import { activeFaceGroups, presentPolygons } from './groupState.ts'

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
 * The faces of the groups the selection holds a face of.
 *
 * @remarks
 * The fill of the views paints these red: a group is a lock, and the mark of its faces says it is one unit
 * (2026-11-18, the owner). The walkable view and the fixed views read the same set, so a group reads the same way on the
 * views.
 */
export const selectedGroupPolygons: ComputedRef<ReadonlySet<ArxPolygon>> = computed(() => {
  const members = new Set<ArxPolygon>()

  if (selectedFaceGroups.value.size === 0) {
    return members
  }

  for (const group of activeFaceGroups.value) {
    if (!selectedFaceGroups.value.has(group.id)) {
      continue
    }

    for (const member of group.members) {
      members.add(member)
    }
  }

  return members
})

/**
 * Reads the predicate of a fill: is this face in one of the picked groups.
 *
 * @param polygons The faces of the groups the selection holds a face of.
 *
 * @returns A function the view's fill asks for every face it paints.
 */
export function inGroupOf(polygons: ReadonlySet<ArxPolygon>): (polygon: ArxPolygon) => boolean {
  return (polygon: ArxPolygon): boolean => {
    return polygons.has(polygon)
  }
}

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
