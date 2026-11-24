import type { ArxPolygon } from 'arx-convert/types'
import { type HistoryCommand, runMetadataStep } from '../history/history.ts'
import {
  type FaceGroupReference,
  type HistoryRecord,
  createCreateFaceGroupRecord,
  createDeleteFaceGroupsRecord,
  createRenameFaceGroupRecord,
  labelOf,
} from '../history/records.ts'
import { levelStore } from '../level/edit/levelStore.ts'
import { selectionStore } from '../selection/selectionStore.ts'
import { applyHiddenPolygons, withoutOverlapsOf } from './groupDerived.ts'
import { saveOpenLevel, soleVersionOf, writeGroupsOf } from './groupPersistence.ts'
import { faceGroupOfFace, faceGroupOfSelection, faceIndicesOfGroup } from './groupQueries.ts'
import { activeFaceGroups, groupState } from './groupState.ts'
import type { FaceGroup } from './groupTypes.ts'

/**
 * Puts groups into the open level, and writes the level down.
 *
 * @remarks
 * The step of a group calls this on its two halves: a group that is there already is not added twice (a redo of a create,
 * or a revert that meets the group it would bring back).
 *
 * @param groups The groups to add.
 */
function addGroups(groups: readonly FaceGroup[]): void {
  const existing = new Set(
    activeFaceGroups.value.map((group) => {
      return group.id
    }),
  )
  const missing = groups.filter((group) => {
    return !existing.has(group.id)
  })

  if (missing.length === 0) {
    return
  }

  const map = levelStore.map.value
  let present: ReadonlySet<ArxPolygon> = new Set()

  if (map !== undefined) {
    present = new Set(map.polygons)
  }

  // a step that puts a group back can not take faces the level grouped since: the first group keeps them
  activeFaceGroups.value = withoutOverlapsOf([...activeFaceGroups.value, ...missing], present)
  saveOpenLevel()
  applyHiddenPolygons()
}

/**
 * Puts groups into the open level from their stored shape, resolving the faces against the level.
 *
 * @remarks
 * The record of a metadata step keeps the faces as the indices of its moment; the step resolves them when it runs, which
 * is the map the step belongs to (the undo takes the steps after it back first, so the indices are the ones of its
 * moment).
 *
 * @param references The groups, with the indices of their faces.
 */
function addGroupsFromReference(references: readonly FaceGroupReference[]): void {
  const map = levelStore.map.value

  if (map === undefined) {
    return
  }

  const groups: FaceGroup[] = []

  for (const reference of references) {
    const members = new Set<ArxPolygon>()

    for (const index of reference.faces) {
      const polygon = map.polygons[index]

      if (polygon !== undefined) {
        members.add(polygon)
      }
    }

    groups.push({ id: reference.id, name: reference.name, members, visible: reference.visible ?? true })
  }

  addGroups(groups)
}

/**
 * Takes groups out of the open level, and writes the level down.
 *
 * @param ids The groups to take out, by the id of the group.
 */
function removeGroups(ids: ReadonlySet<number>): void {
  activeFaceGroups.value = activeFaceGroups.value.filter((group) => {
    return !ids.has(group.id)
  })
  saveOpenLevel()
  // a group that goes takes its hiding with it: the faces it hid come back to the mesh
  applyHiddenPolygons()
}

/**
 * Names a group of the open level, and writes the level down.
 *
 * @param groupId The group to name.
 * @param name The name the author typed, trimmed.
 */
function setGroupName(groupId: number, name: string): void {
  activeFaceGroups.value = activeFaceGroups.value.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, name }
  })
  saveOpenLevel()
}

/**
 * Builds the step of a stored group record: a new group, a rename or a delete.
 *
 * @param record The stored record.
 *
 * @returns The step, or `undefined` when the record is not a group step.
 */
export function faceGroupCommandOf(record: HistoryRecord): HistoryCommand | undefined {
  if (record.kind === 'createFaceGroup') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        addGroupsFromReference([record.group])
      },
      revert: (): void => {
        removeGroups(new Set([record.group.id]))
      },
    }
  }

  if (record.kind === 'renameFaceGroup') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        setGroupName(record.groupId, record.to)
      },
      revert: (): void => {
        setGroupName(record.groupId, record.from)
      },
    }
  }

  if (record.kind === 'deleteFaceGroups') {
    return {
      label: labelOf(record),
      record,
      metadata: true,
      apply: (): void => {
        removeGroups(
          new Set(
            record.groups.map((group) => {
              return group.id
            }),
          ),
        )
      },
      revert: (): void => {
        addGroupsFromReference(record.groups)
      },
    }
  }

  return undefined
}

/**
 * Makes a group of the faces that are selected now.
 *
 * @remarks
 * The group takes the id after the last one of the level, and the name of the default, so a new group reads `group 3`
 * without the author naming it. A group can hold faces another group holds too: the groups are sets of faces, not a
 * partition of the level.
 *
 * @returns The id of the new group, or `undefined` when no face is selected.
 */
export function createFaceGroupFromSelection(): number | undefined {
  const map = levelStore.map.value

  if (map === undefined || !groupState.isLoaded) {
    return undefined
  }

  const members = new Set<ArxPolygon>()

  for (const index of selectionStore.polygons.value) {
    // a face of a group is locked: a selection that holds one is not grouped (the owner's rule, 2026-11-18)
    if (faceGroupOfFace(index) !== undefined) {
      return undefined
    }

    const polygon = map.polygons[index]

    if (polygon !== undefined) {
      members.add(polygon)
    }
  }

  if (members.size === 0) {
    return undefined
  }

  const id = groupState.nextGroupId
  groupState.nextGroupId = groupState.nextGroupId + 1

  const faces = [...selectionStore.polygons.value].toSorted((one, other) => {
    return one - other
  })
  const record = createCreateFaceGroupRecord({ id, name: '', faces })
  const command = faceGroupCommandOf(record)

  if (command !== undefined) {
    runMetadataStep(command)
  }

  return id
}

/**
 * Names a group, or puts the default of its id back.
 *
 * @param mapId The level the group lives on.
 * @param groupId The group to name.
 * @param name The name the author typed; an empty text puts the default back.
 */
export function renameFaceGroup(mapId: string, groupId: number, name: string): void {
  const trimmed = name.trim()

  if (mapId === groupState.activeMapId && groupState.isLoaded) {
    const group = activeFaceGroups.value.find((candidate) => {
      return candidate.id === groupId
    })

    if (group === undefined || group.name === trimmed) {
      return
    }

    const record = createRenameFaceGroupRecord(groupId, group.name, trimmed)
    const command = faceGroupCommandOf(record)

    if (command !== undefined) {
      runMetadataStep(command)
    }

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, name: trimmed }
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Shows or hides the faces of a group of the level on the screen.
 *
 * @remarks
 * The eye of the row writes this, and it is a **view** of the level, not a step of the history: the faces stay in the
 * level, the mesh leaves them out (the picking can not reach them, the export skips them), and the undo of an edit does
 * not turn the view back. The storage keeps the choice with the group, so the next visit of the level finds it.
 *
 * A group of a level that is not open only takes the flag: there is no mesh here to take its faces out of.
 *
 * @param mapId The level the group lives on.
 * @param groupId The group to show or hide.
 * @param visible Whether the mesh draws its faces.
 */
export function setFaceGroupVisibility(mapId: string, groupId: number, visible: boolean): void {
  if (mapId === groupState.activeMapId && groupState.isLoaded) {
    const group = activeFaceGroups.value.find((candidate) => {
      return candidate.id === groupId
    })

    if (group === undefined || group.visible === visible) {
      return
    }

    activeFaceGroups.value = activeFaceGroups.value.map((candidate) => {
      if (candidate.id !== groupId) {
        return candidate
      }

      return { ...candidate, visible }
    })
    saveOpenLevel()
    applyHiddenPolygons()

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.map((group) => {
    if (group.id !== groupId) {
      return group
    }

    return { ...group, visible }
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Takes groups out of a level.
 *
 * @remarks
 * Only the groups go: the faces they held stay in the level (and in the other groups they are in). The step is metadata,
 * so the undo brings the same groups back (the faces are the ones the level holds again), and the groups of a level that
 * is not open are dropped from the storage alone.
 *
 * @param mapId The level the groups live on.
 * @param groupIds The groups to take out.
 */
export function deleteFaceGroups(mapId: string, groupIds: readonly number[]): void {
  const ids = new Set(groupIds)

  if (ids.size === 0) {
    return
  }

  if (mapId === groupState.activeMapId && groupState.isLoaded) {
    const removed = activeFaceGroups.value.filter((group) => {
      return ids.has(group.id)
    })

    if (removed.length === 0) {
      return
    }

    const references: FaceGroupReference[] = removed.map((group) => {
      return { id: group.id, name: group.name, faces: faceIndicesOfGroup(group.id), visible: group.visible }
    })
    const record = createDeleteFaceGroupsRecord(references)
    const command = faceGroupCommandOf(record)

    if (command !== undefined) {
      runMetadataStep(command)
    }

    return
  }

  const stored = soleVersionOf(mapId)

  if (stored === undefined) {
    return
  }

  const groups = stored.entry.groups.filter((group) => {
    return !ids.has(group.id)
  })

  writeGroupsOf(mapId, stored.fingerprint, { ...stored.entry, groups })
}

/**
 * Groups the selection, or ungroups the group the selection is (the `Ctrl+G` of the editor).
 *
 * @remarks
 * The group is a lock: a selection that holds a locked face is not grouped (nothing happens), and a selection that is a
 * whole group takes the lock off (the group goes, the faces stay). The rule is the owner's (2026-11-18): the same key
 * puts the faces into a group and takes them out of it.
 */
export function groupOrUngroupTheSelection(): void {
  const group = faceGroupOfSelection()

  if (group !== undefined) {
    if (groupState.activeMapId !== undefined) {
      deleteFaceGroups(groupState.activeMapId, [group.id])
    }

    return
  }

  createFaceGroupFromSelection()
}
