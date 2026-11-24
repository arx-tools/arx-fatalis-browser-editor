import type { ArxPolygon } from 'arx-convert/types'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { createFaceGroupFromSelection } from './groupCommands.ts'
import { indexMapOf } from './groupDerived.ts'
import { activeFaceGroups, presentPolygons } from './groupState.ts'
import type { FaceGroup } from './groupTypes.ts'

/**
 * The group the face of the open level belongs to.
 *
 * @remarks
 * A face is in one group at most (the groups are a partition of the faces the author locked, see
 * {@link createFaceGroupFromSelection} and the load): the first group that holds it is the one. The faces of the level
 * are polygons in memory, so the search is a walk of the groups and a set lookup in each.
 *
 * @param index The face, by its index in the level.
 *
 * @returns The group, or `undefined` when the face is free (or the level is not open).
 */
export function faceGroupOfFace(index: number): FaceGroup | undefined {
  const map = levelStore.map.value

  if (map === undefined) {
    return undefined
  }

  const polygon = map.polygons[index]

  if (polygon === undefined) {
    return undefined
  }

  return activeFaceGroups.value.find((group) => {
    return group.members.has(polygon)
  })
}

/**
 * The group the selection is exactly, when it is one.
 *
 * @remarks
 * The lock of the groups: a selection that is a whole group (every face of it that is in the level) is the group. The
 * faces are polygons in memory, so the check reads the selection as polygons and counts the members of every group.
 *
 * @returns The group the selection is, or `undefined`.
 */
export function faceGroupOfSelection(): FaceGroup | undefined {
  const map = levelStore.map.value
  const selection = selectionStore.polygons.value

  if (map === undefined || selection.size === 0) {
    return undefined
  }

  const selected = new Set<ArxPolygon>()

  for (const index of selection) {
    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      selected.add(polygon)
    }
  }

  if (selected.size === 0) {
    return undefined
  }

  return activeFaceGroups.value.find((group) => {
    let inside = 0

    for (const member of group.members) {
      if (!presentPolygons.value.has(member)) {
        continue
      }

      if (!selected.has(member)) {
        return false
      }

      inside = inside + 1
    }

    return inside === selected.size
  })
}

/**
 * The faces of a set, with the faces of the groups they belong to.
 *
 * @remarks
 * A group is a unit: a gesture that touches one of its faces touches the whole group. The pick of a click, the pencil of
 * the walkable view and the fill of a double click all go through this, so a locked face never arrives alone in the
 * selection.
 *
 * @param indices The faces of the gesture.
 *
 * @returns The faces and their groups, in the order of the level, without repeats.
 */
export function faceIndicesWithGroupsOf(indices: Iterable<number>): number[] {
  const map = levelStore.map.value
  const faces = new Set<number>()
  let indexOf: Map<ArxPolygon, number> | undefined

  if (map !== undefined) {
    indexOf = indexMapOf(map)
  }

  for (const index of indices) {
    faces.add(index)

    const group = faceGroupOfFace(index)

    if (group === undefined || indexOf === undefined) {
      continue
    }

    for (const member of group.members) {
      const memberIndex = indexOf.get(member)

      if (memberIndex !== undefined) {
        faces.add(memberIndex)
      }
    }
  }

  return [...faces].toSorted((one, other) => {
    return one - other
  })
}

/**
 * The indices of the faces of a group of the open level.
 *
 * @param groupId The group whose faces the selection wants.
 *
 * @returns The indices, in the order of the level; an empty list when the group or the level is gone.
 */
export function faceIndicesOfGroup(groupId: number): number[] {
  const map = levelStore.map.value
  const group = activeFaceGroups.value.find((candidate) => {
    return candidate.id === groupId
  })

  if (map === undefined || group === undefined) {
    return []
  }

  const indexOf = indexMapOf(map)
  const indices: number[] = []

  for (const member of group.members) {
    const index = indexOf.get(member)

    if (index !== undefined) {
      indices.push(index)
    }
  }

  return indices.toSorted((one, other) => {
    return one - other
  })
}
